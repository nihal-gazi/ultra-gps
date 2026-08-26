"""
ONNX Export and Validation Script for Inertial Transformer.
Exports trained PyTorch model to a single self-contained ONNX file for WebGPU / WASM execution in browser.
"""

import os
import sys
import shutil
import torch
import onnx
from onnx.external_data_helper import load_external_data_for_model
from transformer_model import InertialTransformer, InertialTransformerExport

# Ensure UTF-8 console output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def export_to_onnx():
    exp_dir = "model/research/experiments/exp_1"
    results_dir = os.path.join(exp_dir, "results")
    public_models_dir = "public/models"
    os.makedirs(results_dir, exist_ok=True)
    os.makedirs(public_models_dir, exist_ok=True)
    
    ckpt_path = os.path.join(exp_dir, "best_transformer.pt")
    onnx_exp_path = os.path.join(results_dir, "inertial_transformer.onnx")
    onnx_public_path = os.path.join(public_models_dir, "inertial_transformer.onnx")
    
    print("Initializing Inertial Transformer for ONNX export...")
    base_model = InertialTransformer(
        in_features=6,
        d_model=64,
        nhead=4,
        num_layers=2,
        dim_feedforward=128,
        seq_len=20,
        dropout=0.0
    )
    
    if os.path.exists(ckpt_path):
        print(f"Loading weights from {ckpt_path}...")
        state_dict = torch.load(ckpt_path, map_location="cpu")
        base_model.load_state_dict(state_dict)
    else:
        print("Warning: Checkpoint not found. Exporting initialized model.")
        
    base_model.eval()
    export_model = InertialTransformerExport(base_model)
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
    
    # Load and force-embed all external tensor data into a single self-contained monolithic protobuf
    print("Embedding all weights into single monolithic ONNX binary...")
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
            
    # Check file size
    size_kb = os.path.getsize(onnx_exp_path) / 1024
    print(f"Final Monolithic ONNX Model Size: {size_kb:.2f} KB (Self-contained, zero external files)")

if __name__ == "__main__":
    export_to_onnx()
