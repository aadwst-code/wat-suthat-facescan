// ลิงก์ระบบหลังบ้านของคุณชาติชาย
const API_URL = 'https://script.google.com/macros/s/AKfycbgyVud6KS3d8f2NksKVbyTgNd60sjuQIVA5_bw2WWatx_tnmaLRu7E77TL8_HcHsdLw/exec'; 
// ลิงก์คลังสมอง AI ของคุณชาติชาย
const MODEL_URL = 'https://aadwst-code.github.io/wat-suthat-facescan/'; 

const video = document.getElementById('video');
const statusText = document.getElementById('status'); 
let faceMatcher;
let isScanning = false;

// 🚨 ระบบแจ้งเตือนข้อผิดพลาดขึ้นบนหน้าจอโดยตรง (On-Screen Debugger)
// ถ้าโค้ดพังตรงไหน แถบสีแดงจะเด้งขึ้นมาบนหน้าเว็บทันทีครับ
window.onerror = function(msg, url, line) {
    const errorDiv = document.createElement('div');
    errorDiv.style = "position:fixed; top:0; left:0; width:100%; background:red; color:white; padding:20px; z-index:9999; font-size:16px; font-family:sans-serif; text-align:left; box-shadow: 0 4px 10px rgba(0,0,0,0.5);";
    errorDiv.innerHTML = `<b>❌ ระบบสแกนใบหน้าตรวจพบข้อผิดพลาด:</b><br>สาเหตุ: ${msg}<br>บรรทัดที่: ${line}`;
    document.body.appendChild(errorDiv);
    return false;
};

async function startSystem() {
    // บังคับเปลี่ยนข้อความทันทีเพื่อพิสูจน์ว่าสคริปต์ตื่นขึ้นมาทำงานแล้ว
    if (statusText) {
        statusText.innerText = "⏳ [สคริปต์เริ่มทำงาน] กำลังดึงฐานข้อมูลและโหลดสมอง AI...";
        statusText.style.color = "#b45309";
    }

    if (typeof faceapi === 'undefined') {
        throw new Error("ไม่พบตัวควบคุมหน้าจอ (faceapi) กรุณาเช็กไฟล์ index.html ว่าใส่ลิงก์โหลด face-api.js ถูกต้องไหม");
    }

    // 1. โหลดข้อมูลนักเรียนจาก Google Sheet
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`เชื่อมต่อ Google Sheet ล้มเหลว (Status: ${response.status})`);
    const students = await response.json();

    // 2. โหลดโมเดลสมอง AI (เขียนระบบรองรับกรณีคุณชาติชายเก็บไฟล์ไว้ในโฟลเดอร์ย่อย)
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
    } catch (e) {
        console.log("ลองโหลดจากโฟลเดอร์ย่อย /models...");
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL + 'models/'),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL + 'models/'),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL + 'models/')
        ]);
    }

    // 3. เตรียมข้อมูลใบหน้ามาเปรียบเทียบ
    const labeledFaceDescriptors = students.map(student => {
        if (!student.descriptor || student.descriptor.length === 0) return null;
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
            statusText.innerText = "⚠️ เชื่อมต่อสำเร็จ! แต่ไม่พบข้อมูลใบหน้าในคอลัมน์ L (กรุณาไปลงทะเบียนใบหน้าก่อน)";
            statusText.style.color = "#d97706";
        }
        startVideo();
    }
}

function startVideo() {
    if (!video) return;
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            if (statusText) {
                statusText.innerText = "❌ ไม่สามารถเปิดกล้องได้ (กรุณากดอนุญาตให้สิทธิ์เข้าถึงกล้องบนเบราว์เซอร์)";
                statusText.style.color = "red";
            }
        });
}

if (video) {
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
                
                const box = detection.detection.box;
                const drawBox = new faceapi.draw.DrawBox(box, { label: bestMatch.label });
                drawBox.draw(canvas);

                if (bestMatch.label !== 'unknown' && !isScanning) {
                    isScanning = true;
                    const studentId = bestMatch.label;
                    if (statusText) statusText.innerText = `⏳ ตรวจพบรหัส: ${studentId} กำลังส่งข้อมูล...`;

                    const snapCanvas = document.createElement('canvas');
                    snapCanvas.width = video.videoWidth;
                    snapCanvas.height = video.videoHeight;
                    snapCanvas.getContext('2d').drawImage(video, 0, 0);
                    const imageBase64 = snapCanvas.toDataURL('image/jpeg', 0.5).split(',')[1]; 

                    try {
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

                    setTimeout(() => {
                        isScanning = false;
                        if (statusText) {
                            statusText.innerText = "🎥 ระบบสแกนพร้อมใช้งาน";
                            statusText.style.color = "green";
                        }
                    }, 5000);
                }
            }
        }, 1000);
    });
}

// 🚀 แก้ปัญหาข้ามอีเวนต์โหลดหน้าจอ: เช็กสถานะเว็บตรงนี้เลย ถ้าโหลดเสร็จแล้วให้รันทันที
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSystem);
} else {
    startSystem();
}
