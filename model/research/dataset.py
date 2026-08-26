"""
Dataset loader and sequence windowing for IO-VNBD (Inertial and Odometry Benchmark Dataset).
Constructs 6-DOF IMU sequence windows (T=20) and computes ground truth 2D displacements in local ENU frame.
"""

import os
import glob
import math
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader

EARTH_RADIUS = 6371000.0  # meters

def lat_lon_to_local_enu(lats, lons, ref_lat=None, ref_lon=None):
    """
    Converts latitude/longitude array to local tangent plane Cartesian coordinates (meters).
    """
    if ref_lat is None:
        ref_lat = lats[0]
    if ref_lon is None:
        ref_lon = lons[0]
    
    phi_0 = math.radians(ref_lat)
    cos_phi_0 = math.cos(phi_0)
    
    d_lat = np.radians(lats - ref_lat)
    d_lon = np.radians(lons - ref_lon)
    
    x = EARTH_RADIUS * d_lon * cos_phi_0  # East
    y = EARTH_RADIUS * d_lat              # North
    return x, y

class IOVNBDataset(Dataset):
    def __init__(self, data_dir, seq_len=20, stride=5, max_files=15, is_train=True, train_ratio=0.85):
        self.seq_len = seq_len
        self.stride = stride
        
        s_files = sorted(glob.glob(os.path.join(data_dir, "S-*.csv")))
        if not s_files:
            raise FileNotFoundError(f"No S-*.csv files found in {data_dir}")
        
        s_files = s_files[:max_files]
        split_idx = int(len(s_files) * train_ratio)
        if is_train:
            selected_files = s_files[:split_idx] if split_idx > 0 else s_files
        else:
            selected_files = s_files[split_idx:] if split_idx < len(s_files) else s_files[-1:]
            
        print(f"[{'Train' if is_train else 'Validation'}] Loading {len(selected_files)} recording files...")
        
        all_features = []
        all_displacements = []
        all_velocities = []
        all_heading_deltas = []
        
        for s_path in selected_files:
            try:
                df = pd.read_csv(s_path, encoding='latin1')
                
                # Extract 6-DOF IMU columns
                acc_x = df[' ACCELEROMETER X (m/s) '].values if ' ACCELEROMETER X (m/s) ' in df else df.iloc[:, 9].values
                acc_y = df[' ACCELEROMETER Y (m/s)'].values if ' ACCELEROMETER Y (m/s)' in df else df.iloc[:, 10].values
                acc_z = df[' ACCELEROMETER Z (m/s)'].values if ' ACCELEROMETER Z (m/s)' in df else df.iloc[:, 11].values
                
                gyro_yaw = df[' GYROSCOPE Yaw (rad/s)'].values if ' GYROSCOPE Yaw (rad/s)' in df else df.iloc[:, 15].values
                gyro_pitch = df[' GYROSCOPE Pitch (rad/s)'].values if ' GYROSCOPE Pitch (rad/s)' in df else df.iloc[:, 16].values
                gyro_roll = df[' GYROSCOPE Roll (rad/s)'].values if ' GYROSCOPE Roll (rad/s)' in df else df.iloc[:, 17].values
                
                lats = df['GPS LATITUDE (degrees)'].values
                lons = df[' GPS LONGITUDE (degrees)'].values
                
                # Check for NaNs
                valid_mask = ~(np.isnan(acc_x) | np.isnan(acc_y) | np.isnan(acc_z) | 
                               np.isnan(gyro_yaw) | np.isnan(gyro_pitch) | np.isnan(gyro_roll) |
                               np.isnan(lats) | np.isnan(lons))
                
                if np.sum(valid_mask) < seq_len + 10:
                    continue
                    
                acc_x, acc_y, acc_z = acc_x[valid_mask], acc_y[valid_mask], acc_z[valid_mask]
                gyro_yaw, gyro_pitch, gyro_roll = gyro_yaw[valid_mask], gyro_pitch[valid_mask], gyro_roll[valid_mask]
                lats, lons = lats[valid_mask], lons[valid_mask]
                
                # Convert lat/lon to local Cartesian meters
                x_pos, y_pos = lat_lon_to_local_enu(lats, lons)
                
                # 6-DOF inertial feature matrix
                imu_feats = np.stack([acc_x, acc_y, acc_z, gyro_yaw, gyro_pitch, gyro_roll], axis=-1).astype(np.float32)
                
                # Windowing
                N = len(imu_feats)
                for start in range(0, N - seq_len, stride):
                    end = start + seq_len
                    window_x = imu_feats[start:end]
                    
                    dx = x_pos[end] - x_pos[start]
                    dy = y_pos[end] - y_pos[start]
                    dist = math.sqrt(dx * dx + dy * dy)
                    dt = seq_len * 0.1  # 10Hz sampling -> 2.0s
                    vel = dist / dt
                    d_theta = math.atan2(dy, dx)
                    
                    all_features.append(window_x)
                    all_displacements.append([dx, dy])
                    all_velocities.append(vel)
                    all_heading_deltas.append(d_theta)
            except Exception as e:
                print(f"Warning: skipped {s_path} due to error: {e}")
                
        self.features = np.array(all_features, dtype=np.float32)
        self.displacements = np.array(all_displacements, dtype=np.float32)
        self.velocities = np.array(all_velocities, dtype=np.float32)
        self.heading_deltas = np.array(all_heading_deltas, dtype=np.float32)
        
        print(f"Constructed {len(self.features)} sequence windows (T={seq_len}, Dim=6).")
        
    def __len__(self):
        return len(self.features)
        
    def __getitem__(self, idx):
        return {
            'imu_seq': torch.tensor(self.features[idx], dtype=torch.float32),
            'displacement': torch.tensor(self.displacements[idx], dtype=torch.float32),
            'velocity': torch.tensor(self.velocities[idx], dtype=torch.float32),
            'heading_delta': torch.tensor(self.heading_deltas[idx], dtype=torch.float32),
        }

def get_dataloaders(data_dir="model/research/data/raw", batch_size=64, seq_len=20, stride=4, max_files=20):
    train_dataset = IOVNBDataset(data_dir=data_dir, seq_len=seq_len, stride=stride, max_files=max_files, is_train=True)
    val_dataset = IOVNBDataset(data_dir=data_dir, seq_len=seq_len, stride=stride * 2, max_files=max_files, is_train=False)
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)
    
    return train_loader, val_loader
