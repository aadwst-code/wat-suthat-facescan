const video = document.getElementById('video');
const statusText = document.getElementById('statusText');

// === ตรงนี้สำคัญมาก: เดี๋ยวเราต้องเอาลิงก์จาก Google Sheet (Web App URL) มาใส่ในเครื่องหมายคำพูดด้านล่าง ===
const API_URL = 'https://script.google.com/macros/s/AKfycbwZ_2FT3_fDaNzuaUyGYBnjGJEU_q2fMwnO63upXy5jYzHwCHxZhJKOKzPC82b0WD2OyQ/exec'; 

let scanMode = 'เข้า';
let labeledFaceDescriptors = [];
let isScanning = false;

function setScanMode(mode) {
    scanMode = mode;
    document.getElementById('currentMode').innerText = mode;
    if(mode === 'เข้า') {
        document.getElementById('currentMode').style.color = '#1a73e8';
    } else {
        document.getElementById('currentMode').style.color = '#d32f2f';
    }
}

// โหลด Models AI จากอินเทอร์เน็ต
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/models';

Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
  faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
]).then(startVideo).then(loadStudentData).catch(err => {
    statusText.innerText = "เกิดข้อผิดพลาดในการโหลด AI";
    console.error(err);
});

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => video.srcObject = stream)
    .catch(err => {
        console.error("ไม่สามารถเปิดกล้องได้", err);
        statusText.innerText = "ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง";
        statusText.style.color = "red";
    });
}

async function loadStudentData() {
    statusText.innerText = "กำลังดาวน์โหลดฐานข้อมูลใบหน้าจาก Google Sheet...";
    try {
        const response = await fetch(API_URL);
        const students = await response.json();
        
        labeledFaceDescriptors = students.map(student => {
            const floatArray = new Float32Array(student.descriptor);
            return new faceapi.LabeledFaceDescriptors(student.id, [floatArray]);
        });
        statusText.innerText = "ระบบพร้อมใช้งาน กรุณาเดินผ่านกล้อง";
    } catch (error) {
        statusText.innerText = "รอการเชื่อมต่อฐานข้อมูล (กรุณาใส่ API_URL ให้ถูกต้อง)";
        statusText.style.color = "orange";
    }
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.getElementById('videoContainer').append(canvas);
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(canvas, displaySize);

  setInterval(async () => {
    if (labeledFaceDescriptors.length === 0 || isScanning) return;

    const detections = await faceapi.detectAllFaces(video)
        .withFaceLandmarks().withFaceDescriptors();
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    faceapi.draw.drawDetections(canvas, resizedDetections);

    if (detections.length > 0) {
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
        const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);
        
        if (bestMatch.label !== 'unknown') {
            processAttendance(bestMatch.label);
        } else {
            statusText.innerText = "ไม่พบข้อมูลในระบบ กรุณาลองใหม่";
            statusText.style.color = "red";
        }
    }
  }, 1500); 
});

async function processAttendance(studentId) {
    isScanning = true;
    statusText.innerText = `กำลังบันทึกข้อมูล...`;
    
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'logScan', studentId: studentId, status: scanMode })
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            statusText.innerText = `บันทึกสำเร็จ: ${result.name} (${scanMode})`;
            statusText.style.color = "green";
        }
    } catch (error) {
        statusText.innerText = "บันทึกไม่ได้ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต";
    }

    setTimeout(() => { 
        statusText.innerText = "ระบบพร้อมใช้งาน";
        statusText.style.color = "#2e7d32";
        isScanning = false; 
    }, 4000);
}
