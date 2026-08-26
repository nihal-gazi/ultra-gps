"""
Multi-Layer Perceptron (MLP) Architecture for Edge Inertial Odometry.
Designed for Experiment 2 (exp_2) on IO-VNBD dataset.
High-throughput, ultra-low latency (< 1ms) dense regression network with instantaneous kinematic heads.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

class InertialMLP(nn.Module):
    def __init__(
        self,
        seq_len=20,
        in_features=6,
        hidden_dims=[256, 128, 64],
        dropout=0.05
    ):
        super().__init__()
        self.seq_len = seq_len
        self.in_features = in_features
        input_dim = seq_len * in_features  # 20 * 6 = 120 features
        
        # Input Layer Normalization to stabilize raw IMU scaling
        self.input_norm = nn.LayerNorm(input_dim)
        
        # Dense Feature Extraction Backbone with Residual Skip Connection
        self.fc1 = nn.Linear(input_dim, hidden_dims[0])
        self.ln1 = nn.LayerNorm(hidden_dims[0])
        self.act1 = nn.GELU()
        self.drop1 = nn.Dropout(dropout)
        
        self.fc2 = nn.Linear(hidden_dims[0], hidden_dims[1])
        self.ln2 = nn.LayerNorm(hidden_dims[1])
        self.act2 = nn.GELU()
        self.drop2 = nn.Dropout(dropout)
        
        self.fc3 = nn.Linear(hidden_dims[1], hidden_dims[2])
        self.ln3 = nn.LayerNorm(hidden_dims[2])
        self.act3 = nn.GELU()
        
        # 1. 2D Relative Displacement Regression Head: [dx, dy] (in meters)
        self.disp_head = nn.Sequential(
            nn.Linear(hidden_dims[2], 32),
            nn.GELU(),
            nn.Linear(32, 2)
        )
        
        # 2. Instantaneous Speed Head: v >= 0 (in m/s)
        self.speed_head = nn.Sequential(
            nn.Linear(hidden_dims[2], 32),
            nn.GELU(),
            nn.Linear(32, 1),
            nn.Softplus()  # Guarantees strictly non-negative instantaneous velocity
        )
        
        # 3. Instantaneous Turn Delta Head: delta_theta (in radians)
        self.turn_head = nn.Sequential(
            nn.Linear(hidden_dims[2], 32),
            nn.GELU(),
            nn.Linear(32, 1)
        )
        
        # Initialize weights with Xavier uniform
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x):
        # x shape: (B, seq_len, in_features) or (B, seq_len * in_features)
        if x.dim() == 3:
            B = x.shape[0]
            x = x.contiguous().view(B, -1)
            
        x = self.input_norm(x)
        
        h1 = self.drop1(self.act1(self.ln1(self.fc1(x))))
        h2 = self.drop2(self.act2(self.ln2(self.fc2(h1))))
        h3 = self.act3(self.ln3(self.fc3(h2)))
        
        disp = self.disp_head(h3)      # (B, 2) [dx, dy]
        speed = self.speed_head(h3)    # (B, 1) instantaneous speed
        turn = self.turn_head(h3)      # (B, 1) instantaneous delta theta
        
        return disp, speed, turn

class InertialMLPExport(nn.Module):
    """
    ONNX Export wrapper concatenating outputs into a single tensor:
    Output shape: (B, 4) -> [dx, dy, instantaneous_speed, instantaneous_turn_delta]
    """
    def __init__(self, base_model: InertialMLP):
        super().__init__()
        self.base_model = base_model
        
    def forward(self, x):
        disp, speed, turn = self.base_model(x)
        return torch.cat([disp, speed, turn], dim=-1)
