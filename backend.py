from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model
import numpy as np
from PIL import Image
import io
import os
import csv
import math
import mediapipe as mp
import base64
import cv2
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/measure": {"origins": "*"}})

mp_pose = mp.solutions.pose
pose = mp_pose.Pose()

# Helper function to calculate distance between points
def calculate_distance(point1, point2):
    return math.sqrt(((point2.x - point1.x) ** 2) + ((point2.y - point1.y) ** 2))

# Decode base64 image to OpenCV format
def base64_to_image(base64_str):
    try:
        header, encoded = base64_str.split(',', 1)
        img_data = base64.b64decode(encoded)
        np_arr = np.frombuffer(img_data, np.uint8)
        img_np = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_np is not None:
            print("Image decoded successfully.")
        else:
            print("Image decoding failed.")
        return img_np
    except Exception as e:
        print(f"Decoding error: {e}")
        return None

# Extract measurements from pose landmarks
def extract_measurements(landmarks, actual_height):
    VISIBILITY_THRESHOLD = 0.3
    
    # Key points
    points = {
        'shoulder_left': mp_pose.PoseLandmark.LEFT_SHOULDER,
        'shoulder_right': mp_pose.PoseLandmark.RIGHT_SHOULDER,
        'hip_left': mp_pose.PoseLandmark.LEFT_HIP,
        'hip_right': mp_pose.PoseLandmark.RIGHT_HIP,
        'nose': mp_pose.PoseLandmark.NOSE,
        'lfoot': mp_pose.PoseLandmark.LEFT_FOOT_INDEX,
        'rfoot': mp_pose.PoseLandmark.RIGHT_FOOT_INDEX,
    }

    for name, idx in points.items():
        if landmarks[idx].visibility < VISIBILITY_THRESHOLD:
            print(f"Low visibility: {name}")
            return None

    nose = landmarks[points['nose']]
    lfoot = landmarks[points['lfoot']]

    height_px = calculate_distance(nose, lfoot)
    factor = (actual_height - 10) / height_px

    shoulder_width = calculate_distance(landmarks[points['shoulder_left']], landmarks[points['shoulder_right']]) * factor
    hip_width = calculate_distance(landmarks[points['hip_left']], landmarks[points['hip_right']]) * factor
    leg_length = calculate_distance(landmarks[points['hip_left']], landmarks[points['lfoot']]) * factor
    torso_length = calculate_distance(landmarks[points['shoulder_left']], landmarks[points['hip_left']]) * factor

    return [leg_length, torso_length, shoulder_width, hip_width]

# Save measurements to a CSV file
def save_to_csv(data):
    csv_path = 'measurements.csv'
    header = ['Height', 'Torso Length', 'Leg Length', 'Shoulder Width', 'Hip Width']
    write_header = not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0

    with open(csv_path, mode='a', newline='') as file:
        writer = csv.writer(file)
        if write_header:
            writer.writerow(header)
        writer.writerow([data['height'], data['torso_length'], data['leg_length'], data['shoulder_width'], data['hip_width']])

# Endpoint for automatic measurements
@app.route('/measure', methods=['POST'])
def measure():
    print("✅ /measure endpoint hit")

    try:
        data = request.get_json()
        if not data or 'image_data' not in data:
            return jsonify({"error": "No image data provided"}), 400

        img_np = base64_to_image(data['image_data'])
        if img_np is None:
            return jsonify({"error": "Image decoding failed"}), 400

        results = pose.process(cv2.cvtColor(img_np, cv2.COLOR_BGR2RGB))
        if not results.pose_landmarks:
            return jsonify({"error": "No landmarks detected"}), 400

        actual_height = 163  # Replace with dynamic value if required
        measurements = extract_measurements(results.pose_landmarks.landmark, actual_height)
        if measurements is None:
            return jsonify({"error": "Some key landmarks have low visibility."}), 400

        measurement_data = {
            'height': actual_height,
            'torso_length': measurements[1],
            'leg_length': measurements[0],
            'shoulder_width': measurements[2],
            'hip_width': measurements[3],
        }

        save_to_csv(measurement_data)

        return jsonify({
            "message": "Measurements calculated successfully.",
            "measurements": measurement_data
        }), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": f"Internal Server Error: {str(e)}"}), 500

# Endpoint for manual measurements
@app.route('/manual_measurements', methods=['POST'])
def manual_measurements():
    try:
        data = request.get_json()
        if 'height' not in data:
            return jsonify({"error": "Height is required."}), 400

        height = float(data['height'])
        torso_length = 0.3 * height
        leg_length = 0.5 * height
        shoulder_width = 0.2 * height
        hip_width = 0.18 * height

        save_to_csv({
            'height': height,
            'torso_length': torso_length,
            'leg_length': leg_length,
            'shoulder_width': shoulder_width,
            'hip_width': hip_width,
        })

        return jsonify({
            "message": "Manual measurements saved successfully.",
            "measurements": {
                "torso_length": torso_length,
                "leg_length": leg_length,
                "shoulder_width": shoulder_width,
                "hip_width": hip_width,
            }
        }), 200

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": f"Internal Server Error: {str(e)}"}), 500

# Home route
@app.route('/')
def index():
    return "Backend running! Endpoints: /measure, /manual_measurements"

if __name__ == '__main__':
    with app.test_request_context():
        print(app.url_map)
    app.run(debug=True)



