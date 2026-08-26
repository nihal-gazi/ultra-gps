# Experiment 2: Dense Inertial Multi-Layer Perceptron (MLP) on IO-VNBD

## 1. Overview & Motivation

Following **Experiment 1 (IO-Transformer)**, **Experiment 2** investigates a **Multi-Layer Perceptron (MLP)** dense architecture for real-time edge inertial odometry.

### Key Objectives:
1. **Target-Normalized Loss Scaling**:
   In Experiment 1, raw regression targets across large displacement ranges produced inflated unscaled loss values (~50). In Experiment 2, displacement targets are scaled by a characteristic stride normalization factor ($S = 20.0$), bringing regression losses down to tightly bounded levels ($< 1.0$) with smooth convergence.
2. **Instantaneous Kinematics**:
   Direct regression of **instantaneous speed** ($v_{inst}$) and **instantaneous heading turn rate** ($\Delta\theta_{inst}$) without temporal window averaging.
3. **Ultra-Low Latency Edge Footprint**:
   MLP dense feed-forward evaluation executes with sub-millisecond latency ($< 1.0\text{ ms}$) on WebGPU and WASM SIMD, requiring significantly fewer floating-point operations (FLOPs) than Multi-Head Self-Attention.

---

## 2. Neural Architecture

```
Input 6-DOF IMU Sequence (B, T=20, 6)
          |
          v
[Flattened Input (B, 120)]
          |
          v
[Input Layer Normalization (120)]
          |
          v
[Dense Layer 1: Linear(120 -> 256) + LayerNorm + GELU + Dropout(0.05)]
          |
          v
[Dense Layer 2: Linear(256 -> 128) + LayerNorm + GELU + Dropout(0.05)]
          |
          v
[Dense Layer 3: Linear(128 -> 64) + LayerNorm + GELU]
          |
    +-----+--------------------+--------------------+
    |                          |                    |
    v                          v                    v
[Displacement Head]     [Speed Head]         [Turn Delta Head]
(64 -> 32 -> 2)         (64 -> 32 -> 1)      (64 -> 32 -> 1)
Linear + GELU           Linear + Softplus    Linear + GELU
    |                          |                    |
    v                          v                    v
2D Displacement [dx, dy]   Instantaneous Speed  Instantaneous Turn Rate
(meters)                   v (m/s >= 0)         dTheta (radians)
```

---

## 3. Architectural Specifications

| Parameter | Value | Description |
| :--- | :--- | :--- |
| **Input Shape** | $(B, 20, 6) \rightarrow (B, 120)$ | 2.0s rolling window of 6-DOF IMU dynamics |
| **Hidden Layers** | $[256, 128, 64]$ | 3-stage dense feature extraction backbone |
| **Normalizations** | `LayerNorm` | Applied per layer to stabilize activations across sensor scales |
| **Activations** | `GELU` + `Softplus` | Non-negative constraint on speed head via Softplus |
| **Total Parameters** | **$79,636$** | Compact edge binary ($< 320\text{ KB}$) |
| **Inference Latency** | **$< 1.0\text{ ms}$** | Direct dense matrix-vector multiplications on WebGPU |

---

## 4. Multi-Objective Loss Formulation

$$\mathcal{L}_{total} = \mathcal{L}_{disp}\left(\frac{\mathbf{\hat{d}}}{S}, \frac{\mathbf{d}}{S}\right) + \lambda_{dir} \cdot \left(1 - \cos(\mathbf{\hat{d}}, \mathbf{d})\right) + \lambda_v \cdot \mathcal{L}_{mse}(\hat{v}, v) + \lambda_\theta \cdot \mathcal{L}_{mse}(\Delta\hat{\theta}, \Delta\theta)$$

- **$\mathcal{L}_{disp}$**: Smooth L1 loss ($\beta = 0.02$) on normalized target coordinates ($S = 20.0\text{ m}$).
- **Cosine Direction Loss**: Enforces orientation vector collinearity.
- **Kinematic Losses**: Penalizes instantaneous speed and turn angle deviation.
