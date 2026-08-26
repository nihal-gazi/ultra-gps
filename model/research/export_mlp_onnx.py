"""
ONNX Export and Validation Script for Inertial MLP (Experiment 2).
Exports trained dense MLP model to a single self-contained ONNX binary for WebGPU / WASM execution.
"""

import os
import sys
import shutil
import torch
import onnx
from onnx.external_data_helper import load_external_data_for_model
from mlp_model import InertialMLP, InertialMLPExport

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def export_mlp_to_onnx():
    exp_dir = "model/research/experiments/exp_2"
    results_dir = os.path.join(exp_dir, "results")
    public_models_dir = "public/models"
    os.makedirs(results_dir, exist_ok=True)
    os.makedirs(public_models_dir, exist_ok=True)
    
    ckpt_path = os.path.join(exp_dir, "best_mlp.pt")
    onnx_exp_path = os.path.join(results_dir, "inertial_mlp.onnx")
    onnx_public_path = os.path.join(public_models_dir, "inertial_mlp.onnx")
    
    print("Initializing Inertial MLP for ONNX export...")
    base_model = InertialMLP(
        seq_len=20,
        in_features=6,
        hidden_dims=[256, 128, 64],
        dropout=0.0
    )
    
    if os.path.exists(ckpt_path):
        print(f"Loading weights from {ckpt_path}...")
        state_dict = torch.load(ckpt_path, map_location="cpu")
        base_model.load_state_dict(state_dict)
    else:
        print("Warning: Checkpoint not found. Exporting initialized model.")
        
    base_model.eval()
    export_model = InertialMLPExport(base_model)
    export_model.eval()
    
    # Dummy input: Batch=1, SeqLen=20, Dim=6
    dummy_input = torch.randn(1, 20, 6, dtype=torch.float32)
    
    print(f"Exporting ONNX model to {onnx_exp_path}...")
    torch.onnx.export(
        export_model,
        dummy_input,
        onnx_exp_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["imu_sequence"],
        output_names=["odometry_output"],
        dynamic_axes={
            "imu_sequence": {0: "batch_size"},
            "odometry_output": {0: "batch_size"}
        }
    )
    
    # Force-embed all weights into a single monolithic self-contained ONNX binary
    print("Embedding all weights into monolithic ONNX binary...")
    onnx_model = onnx.load(onnx_exp_path)
    load_external_data_for_model(onnx_model, os.path.dirname(onnx_exp_path))
    onnx.save_model(onnx_model, onnx_exp_path, save_as_external_data=False)
    
    # Validate ONNX graph
    print("Validating ONNX model graph structure...")
    onnx.checker.check_model(onnx_exp_path)
    print("ONNX model verification PASSED!")
    
    # Copy to public models directory for WebGPU browser runtime
    shutil.copy2(onnx_exp_path, onnx_public_path)
    
    # Clean up any residual .data files
    for p in [onnx_exp_path + ".data", onnx_public_path + ".data"]:
        if os.path.exists(p):
            os.remove(p)
            
    size_kb = os.path.getsize(onnx_exp_path) / 1024
    print(f"Final Monolithic ONNX MLP Model Size: {size_kb:.2f} KB (Self-contained, zero external files)")

if __name__ == "__main__":
    export_mlp_to_onnx()
