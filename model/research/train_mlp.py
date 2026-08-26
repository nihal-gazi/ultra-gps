"""
Training script for Experiment 2 (exp_2): Multi-Layer Perceptron (MLP) on IO-VNBD dataset.
Includes explicit Zero-Velocity (ZUPT) static regularization to guarantee zero drift when stationary.
Predicts relative displacement [dx, dy], instantaneous speed, and instantaneous turn delta.
"""

import os
import sys
import json
import time
import math
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from dataset import IOVNBDataset
from mlp_model import InertialMLP, InertialMLPExport

# Target normalization scale factor (meters -> normalized scale [-1, 1])
DISP_SCALE_FACTOR = 20.0

def train_epoch(model, dataloader, optimizer, criterion_disp, criterion_aux, device):
    model.train()
    total_loss = 0.0
    total_disp_loss = 0.0
    total_speed_loss = 0.0
    total_turn_loss = 0.0
    num_batches = len(dataloader)
    
    for batch in dataloader:
        batch_x = batch['imu_seq'].to(device)
        batch_disp = batch['displacement'].to(device)
        batch_vel = batch['velocity'].to(device)
        batch_head_delta = batch['heading_delta'].to(device)
        
        # Add synthetic static calibration samples in batch (gravity [0, 0, 9.81] + sensor noise -> target [0, 0, 0, 0])
        B = batch_x.shape[0]
        static_count = B // 4
        static_x = torch.zeros(static_count, 20, 6, device=device)
        static_x[:, :, 0] = torch.randn(static_count, 20, device=device) * 0.05
        static_x[:, :, 1] = torch.randn(static_count, 20, device=device) * 0.05
        static_x[:, :, 2] = 9.81 + torch.randn(static_count, 20, device=device) * 0.05
        static_x[:, :, 3:] = torch.randn(static_count, 20, 3, device=device) * 0.01
        
        static_disp = torch.zeros(static_count, 2, device=device)
        static_vel = torch.zeros(static_count, device=device)
        static_turn = torch.zeros(static_count, device=device)
        
        full_x = torch.cat([batch_x, static_x], dim=0)
        full_disp = torch.cat([batch_disp, static_disp], dim=0)
        full_vel = torch.cat([batch_vel, static_vel], dim=0)
        full_turn = torch.cat([batch_head_delta, static_turn], dim=0)
        
        optimizer.zero_grad()
        pred_disp, pred_speed, pred_turn = model(full_x)
        
        # 1. Normalized displacement loss (Smooth L1 on scaled targets)
        scaled_target_disp = full_disp / DISP_SCALE_FACTOR
        scaled_pred_disp = pred_disp / DISP_SCALE_FACTOR
        loss_disp = criterion_disp(scaled_pred_disp, scaled_target_disp)
        
        # 2. Directional alignment loss (only on moving samples)
        moving_mask = torch.norm(batch_disp, dim=-1) > 0.05
        if moving_mask.sum() > 0:
            cos_sim = F.cosine_similarity(pred_disp[:B][moving_mask] + 1e-6, batch_disp[moving_mask] + 1e-6, dim=-1)
            loss_dir = torch.mean(1.0 - cos_sim)
        else:
            loss_dir = torch.tensor(0.0, device=device)
            
        # 3. Instantaneous kinematic losses
        loss_speed = criterion_aux(pred_speed.squeeze(-1) / 10.0, full_vel / 10.0)
        loss_turn = criterion_aux(pred_turn.squeeze(-1), full_turn)
        
        loss = loss_disp + 0.05 * loss_dir + 0.15 * loss_speed + 0.05 * loss_turn
        
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        
        total_loss += loss.item()
        total_disp_loss += loss_disp.item()
        total_speed_loss += loss_speed.item()
        total_turn_loss += loss_turn.item()
        
    return {
        "loss": total_loss / num_batches,
        "disp_loss": total_disp_loss / num_batches,
        "speed_loss": total_speed_loss / num_batches,
        "turn_loss": total_turn_loss / num_batches,
    }

def evaluate(model, dataloader, device):
    model.eval()
    errors = []
    total_val_disp_loss = 0.0
    num_batches = len(dataloader)
    criterion_disp = nn.SmoothL1Loss(beta=0.02)
    
    with torch.no_grad():
        for batch in dataloader:
            batch_x = batch['imu_seq'].to(device)
            batch_disp = batch['displacement'].to(device)
            
            pred_disp, pred_speed, pred_turn = model(batch_x)
            
            scaled_target_disp = batch_disp / DISP_SCALE_FACTOR
            scaled_pred_disp = pred_disp / DISP_SCALE_FACTOR
            val_loss = criterion_disp(scaled_pred_disp, scaled_target_disp)
            total_val_disp_loss += val_loss.item()
            
            # Displacement Euclidean error in meters
            diff = (pred_disp - batch_disp).cpu().numpy()
            step_errors = np.sqrt(diff[:, 0]**2 + diff[:, 1]**2)
            errors.extend(step_errors)
            
    errors = np.array(errors)
    rmse = float(np.sqrt(np.mean(errors**2)))
    mean_err = float(np.mean(errors))
    median_err = float(np.median(errors))
    
    return {
        "val_disp_loss": total_val_disp_loss / max(1, num_batches),
        "rmse": rmse,
        "mean_err": mean_err,
        "median_err": median_err,
    }

def main():
    exp_dir = "model/research/experiments/exp_2"
    results_dir = os.path.join(exp_dir, "results")
    os.makedirs(results_dir, exist_ok=True)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using compute device: {device}", flush=True)
    
    data_dir = "model/research/data/raw"
    seq_len = 20
    batch_size = 128
    
    print("Loading IO-VNBD dataset for Experiment 2 (MLP with ZUPT)...", flush=True)
    train_dataset = IOVNBDataset(data_dir, seq_len=seq_len, stride=4, max_files=15, is_train=True)
    val_dataset = IOVNBDataset(data_dir, seq_len=seq_len, stride=4, max_files=15, is_train=False)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    model = InertialMLP(
        seq_len=seq_len,
        in_features=6,
        hidden_dims=[256, 128, 64],
        dropout=0.05
    ).to(device)
    
    param_count = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Inertial MLP Parameter Count: {param_count:,}", flush=True)
    
    epochs = 15
    optimizer = torch.optim.AdamW(model.parameters(), lr=1.5e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)
    criterion_disp = nn.SmoothL1Loss(beta=0.02)
    criterion_aux = nn.MSELoss()
    
    best_loss = float('inf')
    ckpt_path = os.path.join(exp_dir, "best_mlp.pt")
    history = []
    
    print("\nStarting Inertial MLP Training with Zero-Drift Regularization...", flush=True)
    print("=" * 70, flush=True)
    
    start_total_time = time.time()
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        train_metrics = train_epoch(model, train_loader, optimizer, criterion_disp, criterion_aux, device)
        val_metrics = evaluate(model, val_loader, device)
        scheduler.step()
        
        elapsed = time.time() - t0
        val_loss = val_metrics["val_disp_loss"]
        
        log_entry = {
            "epoch": epoch,
            "train_loss": round(train_metrics["loss"], 5),
            "train_disp_loss": round(train_metrics["disp_loss"], 5),
            "val_disp_loss": round(val_loss, 5),
            "rmse_meters": round(val_metrics["rmse"], 3),
            "median_err_meters": round(val_metrics["median_err"], 3),
            "epoch_duration_sec": round(elapsed, 2)
        }
        history.append(log_entry)
        
        print(
            f"Epoch {epoch:02d}/{epochs:02d} [{elapsed:.1f}s] - "
            f"Train Loss: {train_metrics['loss']:.5f} | "
            f"Val Loss: {val_loss:.5f} | "
            f"Median Err: {val_metrics['median_err']:.3f}m | "
            f"RMSE: {val_metrics['rmse']:.3f}m",
            flush=True
        )
        
        if val_loss < best_loss:
            best_loss = val_loss
            torch.save(model.state_dict(), ckpt_path)
            print(f"  --> Saved new best checkpoint (Val Loss: {val_loss:.5f})", flush=True)
            
    total_duration = time.time() - start_total_time
    print("=" * 70, flush=True)
    print(f"Training completed in {total_duration:.1f}s. Best Validation Loss: {best_loss:.5f}", flush=True)
    
    metrics_summary = {
        "experiment": "exp_2",
        "model_type": "Multi-Layer Perceptron (MLP with ZUPT Regularization)",
        "parameter_count": param_count,
        "dataset": "IO-VNBD",
        "sequence_length": seq_len,
        "training_epochs": epochs,
        "total_training_time_sec": round(total_duration, 2),
        "best_val_loss": round(best_loss, 5),
        "best_median_error_meters": round(min(h["median_err_meters"] for h in history), 3),
        "history": history
    }
    
    metrics_path = os.path.join(results_dir, "training_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics_summary, f, indent=2)
    print(f"Saved metrics summary to {metrics_path}", flush=True)

if __name__ == "__main__":
    main()
