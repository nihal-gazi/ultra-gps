# Experiment 1: Inertial Odometry Transformer on IO-VNBD

## 1. Overview & Objective

This experiment investigates the transition of real-time geospatial positioning from classical Step-and-Heading heuristic equations (such as the Weinberg model) to an end-to-end **Inertial Odometry Transformer (IO-Transformer)**.

The objective is to train a multi-head self-attention neural network directly on 6-DOF inertial measurement unit (IMU) time-series sequences from the **IO-VNBD** (Inertial and Odometry Vehicle Navigation Benchmark Dataset) and export an optimized, ultra-lightweight ONNX model capable of executing via **WebGPU / WASM** directly in client browsers and mobile hardware.

---

## 2. Dataset Description (IO-VNBD)

- **Source**: [https://github.com/onyekpeu/IO-VNBD](https://github.com/onyekpeu/IO-VNBD) (Onyekpe et al.)
- **Modalities Used**:
  - **Smartphone 6-DOF IMU Streams**:
    - 3-Axis Acceleration ($a_x, a_y, a_z$ in $\text{m/s}^2$)
    - 3-Axis Angular Velocity ($\omega_x, \omega_y, \omega_z$ in $\text{rad/s}$)
  - **Ground Truth Positioning**: High-precision synchronized GNSS and vehicle ECU odometry coordinates ($\text{Latitude}, \text{Longitude}, \text{Speed}$).
- **Sampling Frequency**: $10\text{ Hz}$ ($\Delta t = 100\text{ ms}$).
- **Local Tangent Coordinate Projection**:
  Geodetic latitude and longitude coordinates are transformed to a local Cartesian East-North-Up (ENU) tangent plane:
  $$x = R \cdot (\lambda - \lambda_0) \cdot \cos(\phi_0)$$
  $$y = R \cdot (\phi - \phi_0)$$
  where $R = 6,371,000\text{ m}$.

---

## 3. Neural Architecture Formulation

```
Input IMU Sequence (B, T=20, 6)
          |
          v
[Linear Tokenizer & LayerNorm (6 -> 64)]
          |
          v
[+ Learnable Temporal Positional Encoding (20, 64)]
          |
          v
[Transformer Encoder Block 1 (4 Attention Heads, FFN=128, GELU, Norm-First)]
          |
          v
[Transformer Encoder Block 2 (4 Attention Heads, FFN=128, GELU, Norm-First)]
          |
          v
[Temporal Multi-Head Query Pooling (B, 1, 64)]
          |
    +-----+--------------------+
    |                          |
    v                          v
[Displacement Head]     [Auxiliary Head]
(64 -> 32 -> 2)         (64 -> 32 -> 2)
    |                          |
    v                          v
2D Displacement [dx, dy]   [Speed v, Delta Theta]
```

### Key Architectural Hyperparameters

| Hyperparameter | Value | Description |
| :--- | :--- | :--- |
| **Sequence Length ($T$)** | $20$ timesteps | $2.0\text{ seconds}$ inertial context window at $10\text{ Hz}$ |
| **Input Feature Dimension** | $6$ | $[a_x, a_y, a_z, \omega_z, \omega_x, \omega_y]$ |
| **Model Dimension ($d_{model}$)** | $64$ | Latent sequence embedding dimension |
| **Attention Heads ($nhead$)** | $4$ | Multi-Head Self-Attention subspaces ($d_k = 16$) |
| **Encoder Layers** | $2$ | Stacked Transformer encoder blocks |
| **Feed-Forward Dimension** | $128$ | Pointwise MLP expansion factor with GELU activation |
| **Dropout** | $0.10$ | Regularization applied to attention weights and projections |
| **Parameter Count** | $\approx 78,000$ | Highly compact for edge inference ($< 350\text{ KB}$ ONNX binary) |

---

## 4. Loss Function Formulation

The model is trained using a multi-objective loss function combining distance regression, directional cosine alignment, and auxiliary kinematic speed estimation:

$$\mathcal{L}_{total} = \mathcal{L}_{huber}(\mathbf{\hat{d}}, \mathbf{d}) + \lambda_{dir} \cdot \mathcal{L}_{cosine}(\mathbf{\hat{d}}, \mathbf{d}) + \lambda_{aux} \cdot \mathcal{L}_{mse}(\mathbf{\hat{y}}_{aux}, \mathbf{y}_{aux})$$

1. **Huber / Smooth L1 Displacement Loss**:
   $$\mathcal{L}_{huber} = \begin{cases} 0.5 (\mathbf{\hat{d}} - \mathbf{d})^2 / \beta & \text{if } |\mathbf{\hat{d}} - \mathbf{d}| < \beta \\ |\mathbf{\hat{d}} - \mathbf{d}| - 0.5\beta & \text{otherwise} \end{cases}$$
   with $\beta = 0.5\text{ m}$.

2. **Cosine Direction Alignment Loss**:
   Enforces orientation vector consistency:
   $$\mathcal{L}_{cosine} = 1 - \frac{\mathbf{\hat{d}} \cdot \mathbf{d}}{\|\mathbf{\hat{d}}\|_2 \|\mathbf{d}\|_2 + \epsilon}$$

3. **Auxiliary Loss**:
   Penalizes speed and heading angular variation errors ($\lambda_{aux} = 0.1$).

---

## 5. Training Protocol

- **Optimizer**: `AdamW` with initial learning rate $\eta = 1 \times 10^{-3}$ and weight decay $1 \times 10^{-4}$.
- **Learning Rate Scheduler**: Cosine Annealing scheduler decayed to $\eta_{min} = 1 \times 10^{-5}$ over 12 epochs.
- **Batch Size**: $128$ sequences.
- **Gradient Clipping**: Norm clipped at $1.5$.
- **Validation Protocol**: Independent validation split evaluated on holdout recording sessions.
