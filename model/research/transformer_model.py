"""
Inertial Odometry Transformer (IO-Transformer).
Multi-Head Self-Attention model designed for real-time edge inference and ONNX / WebGPU export.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

class InertialTransformer(nn.Module):
    def __init__(self, in_features=6, d_model=64, nhead=4, num_layers=2, dim_feedforward=128, seq_len=20, dropout=0.1):
        super().__init__()
        self.seq_len = seq_len
        self.d_model = d_model
        
        # 1. Feature Tokenizer & Linear Embedding
        self.input_proj = nn.Sequential(
            nn.Linear(in_features, d_model),
            nn.LayerNorm(d_model),
            nn.GELU()
        )
        
        # 2. Learnable Positional Embedding
        self.pos_embedding = nn.Parameter(torch.randn(1, seq_len, d_model) * 0.02)
        self.dropout = nn.Dropout(dropout)
        
        # 3. Transformer Encoder Layers
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.norm = nn.LayerNorm(d_model)
        
        # 4. Temporal Attention Pooling
        self.temporal_query = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.temporal_attn = nn.MultiheadAttention(embed_dim=d_model, num_heads=2, batch_first=True)
        
        # 5. Dual Regression Heads
        self.displacement_head = nn.Sequential(
            nn.Linear(d_model, 64),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(64, 32),
            nn.GELU(),
            nn.Linear(32, 2) # [delta_x, delta_y] meters
        )
        
        self.aux_head = nn.Sequential(
            nn.Linear(d_model, 32),
            nn.GELU(),
            nn.Linear(32, 2) # [speed (m/s), delta_theta (rad)]
        )
        
    def forward(self, x):
        """
        Forward pass for training and real-time ONNX / WebGPU inference.
        Args:
            x: Tensor of shape (B, seq_len=20, in_features=6)
        Returns:
            displacement: Tensor of shape (B, 2) -> [dx, dy]
            aux: Tensor of shape (B, 2) -> [speed, delta_theta]
        """
        B, T, C = x.shape
        
        # Project inputs to d_model
        h = self.input_proj(x) # (B, T, d_model)
        
        # Add positional embedding
        h = h + self.pos_embedding[:, :T, :]
        h = self.dropout(h)
        
        # Pass through Transformer encoder
        encoded = self.transformer_encoder(h) # (B, T, d_model)
        encoded = self.norm(encoded)
        
        # Temporal Attention Pooling
        query = self.temporal_query.expand(B, -1, -1) # (B, 1, d_model)
        pooled, _ = self.temporal_attn(query, encoded, encoded) # (B, 1, d_model)
        pooled = pooled.squeeze(1) # (B, d_model)
        
        # Compute 2D displacement & auxiliary predictions
        displacement = self.displacement_head(pooled) # (B, 2)
        aux = self.aux_head(pooled) # (B, 2)
        
        return displacement, aux

class InertialTransformerExport(nn.Module):
    """
    ONNX WebGPU Export Wrapper returning primary 2D displacement tensor [dx, dy].
    """
    def __init__(self, base_model):
        super().__init__()
        self.base_model = base_model
        
    def forward(self, x):
        displacement, aux = self.base_model(x)
        # Returns concatenated [dx, dy, speed, delta_theta] for complete trajectory update
        return torch.cat([displacement, aux], dim=-1)
