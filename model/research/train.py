"""
Training script for Inertial Odometry Transformer on IO-VNBD Benchmark Dataset.
Saves model checkpoint and evaluation results to model/research/experiments/exp_1/.
"""

import os
import time
import json
import math
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from dataset import get_dataloaders
from transformer_model import InertialTransformer

def train_epoch(model, loader, optimizer, criterion_disp, criterion_aux, device):
    model.train()
    total_loss = 0.0
    total_disp_loss = 0.0
    total_dir_loss = 0.0
    
    for batch in loader:
        x = batch['imu_seq'].to(device)
        y_disp = batch['displacement'].to(device)
        y_vel = batch['velocity'].to(device)
        y_hdg = batch['heading_delta'].to(device)
        
        y_aux = torch.stack([y_vel, y_hdg], dim=-1)
        
        optimizer.zero_grad()
        pred_disp, pred_aux = model(x)
        
        # 1. Huber / Smooth L1 loss on 2D displacement
        loss_disp = criterion_disp(pred_disp, y_disp)
        
        # 2. Cosine Direction Loss
        pred_norm = F.normalize(pred_disp, p=2, dim=-1, eps=1e-6)
        true_norm = F.normalize(y_disp, p=2, dim=-1, eps=1e-6)
        loss_dir = torch.mean(1.0 - torch.sum(pred_norm * true_norm, dim=-1))
        
        # 3. Aux Loss (Velocity and Heading)
        loss_aux = criterion_aux(pred_aux, y_aux)
        
        loss = loss_disp + 0.3 * loss_dir + 0.1 * loss_aux
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.5)
        optimizer.step()
        
        total_loss += loss.item()
        total_disp_loss += loss_disp.item()
        total_dir_loss += loss_dir.item()
        
    n = len(loader)
    return total_loss / n, total_disp_loss / n, total_dir_loss / n

def evaluate(model, loader, criterion_disp, device):
    model.eval()
    total_disp_loss = 0.0
    errors = []
    
    with torch.no_grad():
        for batch in loader:
            x = batch['imu_seq'].to(device)
            y_disp = batch['displacement'].to(device)
            
            pred_disp, _ = model(x)
            loss_disp = criterion_disp(pred_disp, y_disp)
            total_disp_loss += loss_disp.item()
            
            # Euclidean displacement error in meters
            err = torch.norm(pred_disp - y_disp, dim=-1).cpu().numpy()
            errors.extend(err)
            
    n = len(loader)
    errors = np.array(errors)
    mean_err = float(np.mean(errors))
    median_err = float(np.median(errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    
    return total_disp_loss / n, mean_err, median_err, rmse

def main():
    import torch.nn.functional as F
    globals()['F'] = F
    
    exp_dir = "model/research/experiments/exp_1"
    results_dir = os.path.join(exp_dir, "results")
    os.makedirs(results_dir, exist_ok=True)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using compute device: {device}")
    
    # 1. Load Data
    print("Loading IO-VNBD dataset...")
    train_loader, val_loader = get_dataloaders(
        data_dir="model/research/data/raw",
        batch_size=128,
        seq_len=20,
        stride=4,
        max_files=15
    )
    print(f"Train batches: {len(train_loader)}, Val batches: {len(val_loader)}")
    
    # 2. Build Model
    model = InertialTransformer(
        in_features=6,
        d_model=64,
        nhead=4,
        num_layers=2,
        dim_feedforward=128,
        seq_len=20,
        dropout=0.1
    ).to(device)
    
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Inertial Transformer Parameter Count: {param_count:,}")
    
    # 3. Optimization Setup
    optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    epochs = 12
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)
    
    criterion_disp = nn.SmoothL1Loss(beta=0.5)
    criterion_aux = nn.MSELoss()
    
    # 4. Training Loop
    history = []
    best_rmse = float("inf")
    best_ckpt_path = os.path.join(exp_dir, "best_transformer.pt")
    
    start_time = time.time()
    print("\nStarting Transformer Training on IO-VNBD...")
    print("=" * 70)
    
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        train_loss, train_disp, train_dir = train_epoch(
            model, train_loader, optimizer, criterion_disp, criterion_aux, device
        )
        val_loss, mean_err, median_err, rmse = evaluate(model, val_loader, criterion_disp, device)
        scheduler.step()
        
        elapsed = time.time() - t0
        print(f"Epoch {epoch:02d}/{epochs:02d} [{elapsed:.1f}s] - "
              f"Train Loss: {train_loss:.4f} | Val Disp Loss: {val_loss:.4f} | "
              f"RMSE: {rmse:.3f}m | Mean Err: {mean_err:.3f}m | Median Err: {median_err:.3f}m")
              
        history.append({
            "epoch": epoch,
            "train_loss": train_loss,
            "train_disp_loss": train_disp,
            "train_dir_loss": train_dir,
            "val_disp_loss": val_loss,
            "mean_error_m": mean_err,
            "median_error_m": median_err,
            "rmse_m": rmse,
            "lr": optimizer.param_groups[0]["lr"]
        })
        
        if rmse < best_rmse:
            best_rmse = rmse
            torch.save(model.state_dict(), best_ckpt_path)
            print(f"  --> Saved new best checkpoint (RMSE: {rmse:.3f}m)")
            
    total_time = time.time() - start_time
    print("=" * 70)
    print(f"Training completed in {total_time:.1f}s. Best Validation RMSE: {best_rmse:.3f}m")
    
    # Save training metrics JSON
    metrics_path = os.path.join(results_dir, "training_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump({
            "model_architecture": "InertialTransformer",
            "parameters": param_count,
            "sequence_length": 20,
            "features": ["ax", "ay", "az", "gx", "gy", "gz"],
            "dataset": "IO-VNBD (Inertial and Odometry Vehicle Navigation Benchmark Dataset)",
            "training_time_seconds": round(total_time, 2),
            "best_rmse_meters": round(best_rmse, 3),
            "final_metrics": history[-1],
            "epoch_history": history
        }, f, indent=2)
    print(f"Saved metrics summary to {metrics_path}")

if __name__ == "__main__":
    main()
