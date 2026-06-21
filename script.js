// ลิงก์ระบบหลังบ้านของคุณชาติชาย
const API_URL = 'https://script.google.com/macros/s/AKfycbgyVud6KS3d8f2NksKVbyTgNd60sjuQIVA5_bw2WWatx_tnmaLRu7E77TL8_HcHsdLw/exec'; 
// เปลี่ยนเป็น URL สัมบูรณ์ตรงเข้าคลัง GitHub ของคุณโดยตรง เพื่อความแม่นยำ 100% ไม่หลงโฟลเดอร์
const MODEL_URL = 'https://aadwst-code.github.io/wat-suthat-facescan/'; 

const video = document.getElementById('video');
const statusText = document.getElementById('status'); 
let faceMatcher;
let isScanning = false;

async function startSystem() {
    try {
        // 1. ตรวจสอบก่อนเลยว่าหน้าเว็บได้ดึงตัว face-api.js มาจริงไหม
        if (typeof faceapi === 'undefined') {
            if (statusText) {
                statusText.innerText = "❌ ไม่พบไลบรารี face-api.js ในหน้าเว็บ กรุณาตรวจสอบไฟล์ index.html";
                statusText.style.color = "red";
            }
            return;
        }

        if (statusText) {
            statusText.innerText = "⏳ กำลังเชื่อมต่อฐานข้อมูล Google Sheet และดาวน์โหลดสมอง AI...";
            statusText.style.color = "#b45309"; // สีส้มช่วงโหลด
        }
        
        // 2. ดึงข้อมูลนักเรียนจาก Google Sheet
        const response = await fetch(API_URL);
        const students = await response.json();
        
        // 3. โหลดโมเดล AI จาก GitHub ของตัวเอง
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        // 4. เตรียมข้อมูลใบหน้ามาเปรียบเทียบ
        const labeledFaceDescriptors = students.map(student => {
            if (!student.descriptor || student.descriptor.length === 0) return null;
            const descriptorArray = new Float32Array(student.descriptor);
            return new faceapi.LabeledFaceDescriptors(student.id, [descriptorArray]);
        }).filter(item => item !== null);

        // 5. ตรวจสอบว่าในคอลัมน์ L มีข้อมูลใบหน้าไหม
        if (labeledFaceDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.5); 
            if (statusText) {
                statusText.innerText = "✅ ระบบ AI พร้อมใช้งาน กำลังเปิดกล้อง...";
                statusText.style.color = "green";
            }
            startVideo();
        } else {
            if (statusText) {
                statusText.innerText = "⚠️ เชื่อมต่อสำเร็จ! แต่ไม่มีข้อมูลใบหน้าในคอลัมน์ L (กรุณาไปที่หน้าระบบลงทะเบียนเพื่อบันทึกหน้าก่อน)";
                statusText.style.color = "#d97706";
            }
            // ถึงจะไม่มีข้อมูลใบหน้า ก็สั่งเปิดกล้องทดสอบไว้ก่อนได้เลย
            startVideo();
        }
    } catch (error) {
        console.error("System Start Error:", error);
        if (statusText) {
            statusText.innerText = "❌ เกิดข้อผิดพลาด: ไม่สามารถโหลดโมเดล AI หรือเชื่อมต่อฐานข้อมูลได้";
            statusText.style.color = "red";
        }
    }
}

function startVideo() {
    if (!video) return;
    navigator.mediaDevices.getUserMedia({ video: {} })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.error("Camera Error:", err);
            if (statusText) {
                statusText.innerText = "❌ ไม่สามารถเข้าถึงกล้องได้ (กรุณากดอนุญาตสิทธิ์ให้เว็บเปิดกล้องด้วยนะครับ)";
                statusText.style.color = "red";
            }
        });
}

// ระบบสแกนและส่งข้อมูลเมื่อเปิดกล้องสำเร็จ
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
                    if (statusText) statusText.innerText = `⏳ ตรวจพบรหัส: ${studentId} กำลังบันทึกข้อมูล...`;

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

// เรียกใช้คำสั่งเมื่อโหลดโครงสร้างหน้าเว็บเสร็จ (ปลอดภัยกว่า window.onload)
document.addEventListener('DOMContentLoaded', startSystem);
