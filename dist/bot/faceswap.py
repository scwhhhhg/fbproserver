import sys
import cv2
import insightface
from insightface.app import FaceAnalysis
import numpy as np
import os

def swap_face(source_path, target_path, output_path):
    try:
        # Initialize FaceAnalysis
        app = FaceAnalysis(name='buffalo_l')
        app.prepare(ctx_id=0, det_size=(640, 640))
        
        # Search for model in common locations (NO DOWNLOADS)
        model_name = 'inswapper_128.onnx'
        model_path = None
        
        # Check explicit relative paths first
        possible_paths = [
            os.path.join(os.getcwd(), 'bot', model_name),  # C:\fbproblaster\bot\inswapper_128.onnx
            os.path.join(os.path.dirname(__file__), model_name), # Script dir
            os.path.join(os.getcwd(), model_name), # CWD
        ]
        
        for p in possible_paths:
            if os.path.exists(p):
                model_path = p
                print(f"Found model at: {p}")
                break
        
        if not model_path:
            raise FileNotFoundError(f"Model {model_name} not found in any of these locations: {possible_paths}")
            
        print(f"Loading local model from: {model_path}")
        swapper = insightface.model_zoo.get_model(model_path, download=False)

        # Read images
        img_source = cv2.imread(source_path)
        img_target = cv2.imread(target_path)

        if img_source is None:
            print(f"Error: Source image not found at {source_path}")
            return False
            
        if img_target is None:
            print(f"Error: Target image not found at {target_path}")
            return False

        # Get faces
        source_faces = app.get(img_source)
        if len(source_faces) == 0:
            print("Error: No face detected in source image")
            return False
            
        source_face = sorted(source_faces, key=lambda x: x.bbox[2]*x.bbox[3])[-1] # Largest face

        target_faces = app.get(img_target)
        if len(target_faces) == 0:
            print("Error: No face detected in target image")
            return False

        # Swap output
        result_img = img_target.copy()
        
        # Swap all faces in target
        for target_face in target_faces:
            result_img = swapper.get(result_img, target_face, source_face, paste_back=True)

        cv2.imwrite(output_path, result_img)
        print(f"Success: {output_path}")
        return True

    except Exception as e:
        print(f"Error: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python faceswap.py <source> <target> <output>")
        sys.exit(1)
        
    source = sys.argv[1]
    target = sys.argv[2]
    output = sys.argv[3]
    
    success = swap_face(source, target, output)
    if not success:
        sys.exit(1)
