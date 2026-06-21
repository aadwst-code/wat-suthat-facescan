// ลิงก์ระบบหลังบ้านของคุณชาติชาย (ใส่ให้เรียบร้อยแล้วครับ)
const API_URL = 'https://script.google.com/macros/s/AKfycbgyVud6KS3d8f2NksKVbyTgNd60sjuQIVA5_bw2WWatx_tnmaLRu7E77TL8_HcHsdLw/exec'; 
// สั่งให้โหลดโมเดล AI จากใน GitHub ตัวเองโดยตรง ป้องกันการโดนบล็อก
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models'; 

const video = document.getElementById('video');
const statusText = document.getElementById('status'); 
let faceMatcher;
let isScanning = false;

// 1. เริ่มโหลดระบบ
async function startSystem() {
    try {
        if (statusText) statusText.innerText = "กำลังเชื่อมต่อฐานข้อมูลและโหลดสมอง AI...";
        
        // โหลดฐานข้อมูลใบหน้าจาก Google Sheet
        const response = await fetch(API_URL);
        const students = await response.json();
        
        // โหลดโมเดล AI จากในเซิร์ฟเวอร์ของเราเอง
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        // จัดเตรียมข้อมูลเพื่อเปรียบเทียบใบหน้า
        const labeledFaceDescriptors = students.map(student => {
            if (!student.descriptor) return null;
            const descriptorArray = new Float32Array(student.descriptor);
            return new faceapi.LabeledFaceDescriptors(student.id, [descriptorArray]);
        }).filter(item => item !== null);

        if (labeledFaceDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.5); 
            if (statusText) {
                statusText.innerText = "✅ ระบบ AI พร้อมใช้งาน กำลังเปิดกล้อง...";
                statusText.style.color = "green";
            }
            startVideo();
        } else {
            if (statusText) {
                statusText.innerText = "❌ ยังไม่มีข้อมูลใบหน้าในระบบ กรุณาลงทะเบียนก่อน";
                statusText.style.color = "orange";
            }
        }
    } catch (error) {
        console.error("System Start Error:", error);
        if (statusText) {
            statusText.innerText = "❌ เกิดข้อผิดพลาด: ไม่สามารถเชื่อมต่อ Google Sheet หรือโหลดโมเดลได้";
            statusText.style.color = "red";
        }
    }
}

// 2. เปิดกล้องวิดีโอ
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.error("Camera Error:", err);
            if (statusText) statusText.innerText = "❌ ไม่สามารถเข้าถึงกล้องได้ (กรุณากดอนุญาตให้เปิดกล้อง)";
        });
}

// 3. ตรวจจับใบหน้าเวลาเดินผ่าน
video.addEventListener('play', () => {
    const canvas = faceapi.createCanvasFromMedia(video);
    document.body.append(canvas);
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (!faceMatcher || isScanning) return;

        const detections = await faceapi.detectAllFaces(video).withFaceLandmarks().withFaceDescriptors();
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        for (const detection of resizedDetections) {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            
            // วาดกรอบชื่อบนหน้าจอกล้อง
            const box = detection.detection.box;
            const drawBox = new faceapi.draw.DrawBox(box, { label: bestMatch.label });
            drawBox.draw(canvas);

            // ถ้าเจอคนในระบบและไม่ได้กำลังประมวลผลอยู่
            if (bestMatch.label !== 'unknown' && !isScanning) {
                isScanning = true;
                const studentId = bestMatch.label;
                if (statusText) statusText.innerText = `⏳ ตรวจพบรหัส: ${studentId} กำลังบันทึกข้อมูล...`;

                // 📸 แอบถ่ายภาพจากกล้อง ณ วินาทีนั้น
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = video.videoWidth;
                snapCanvas.height = video.videoHeight;
                snapCanvas.getContext('2d').drawImage(video, 0, 0);
                const imageBase64 = snapCanvas.toDataURL('image/jpeg', 0.5).split(',')[1]; 

                try {
                    // ส่งข้อมูลไปที่ Google Sheet + ไลน์แจ้งเตือน
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        body: JSON.stringify({ 
                            action: 'logScan', 
                            studentId: studentId, 
                            status: 'สแกนเข้าโรงเรียน',
                            image: imageBase64 
                        })
                    });
                    const result = await res.json();
                    
                    if(result.status === 'success') {
                        if (statusText) {
                            statusText.innerText = `🔔 บันทึกสำเร็จ: ${result.name}`;
                            statusText.style.color = "blue";
                        }
                    }
                } catch(e) {
                    console.error("Error sending log:", e);
                }

                // หน่วงเวลา 5 วินาทีก่อนสแกนคนต่อไป (ป้องกันปัญหาส่งไลน์ซ้ำๆ)
                setTimeout(() => {
                    isScanning = false;
                    if (statusText) {
                        statusText.innerText = "🎥 ระบบสแกนพร้อมใช้งาน";
                        statusText.style.color = "green";
                    }
                }, 5000);
            }
        }
    }, 1000); // ตรวจสอบใบหน้าทุก 1 วินาที
});

window.onload = startSystem;
