const video = document.getElementById('video');
const statusText = document.getElementById('statusText');
const API_URL = 'ใส่_WEB_APP_URL_ของคุณที่นี่'; 
let scanMode = 'เข้า';
let labeledFaceDescriptors = [];
let isScanning = false;

function setScanMode(mode) {
    scanMode = mode;
    document.getElementById('currentMode').innerText = mode;
}

// 1. โหลด Models จากโฟลเดอร์ models/ ใน GitHub
Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('/models')
]).then(startVideo).then(loadStudentData);

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then(stream => video.srcObject = stream)
    .catch(err => console.error("ไม่สามารถเปิดกล้องได้", err));
}

// 2. ดึงข้อมูลใบหน้าจาก Google Sheet ผ่าน GAS
async function loadStudentData() {
    statusText.innerText = "กำลังดาวน์โหลดฐานข้อมูลใบหน้า...";
    const response = await fetch(API_URL);
    const students = await response.json();
    
    labeledFaceDescriptors = students.map(student => {
        const floatArray = new Float32Array(student.descriptor);
        return new faceapi.LabeledFaceDescriptors(student.id, [floatArray]);
    });
    statusText.innerText = "ระบบพร้อมใช้งาน กรุณาเดินผ่านกล้อง";
}

// 3. ตรวจจับและเปรียบเทียบใบหน้า
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
            document.getElementById('soundFail').play();
            statusText.innerText = "ไม่พบข้อมูลในระบบ กรุณาลองใหม่";
            statusText.style.color = "red";
        }
    }
  }, 1000); // เช็คทุกๆ 1 วินาที
});

// 4. ส่งข้อมูลไปบันทึก
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
            document.getElementById('soundSuccess').play();
            statusText.innerText = `บันทึกสำเร็จ: ${result.name} (${scanMode})`;
            statusText.style.color = "green";
        }
    } catch (error) {
        document.getElementById('soundFail').play();
        statusText.innerText = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
    }

    // หน่วงเวลา 5 วินาทีเพื่อไม่ให้สแกนซ้ำรัวๆ
    setTimeout(() => { 
        statusText.innerText = "ระบบพร้อมใช้งาน";
        statusText.style.color = "#2e7d32";
        isScanning = false; 
    }, 5000);
}
