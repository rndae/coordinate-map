let map;
let currentFrame = 1;
let maxFrame = 0;
const points = [];
const markers = [];
const labels = [];
const lines = [];
const colors = {};
const trackIds = new Set();
let animationInterval;
const frameRate = 31;
const frameDuration = 1000 / frameRate;
const csvFiles = ["camV3_1_attributes.csv", "camV4_1_attributes.csv", "camV2_1_attributes.csv", "camV1_1_attributes.csv"];

function getColor(trackId) {
    if (!colors[trackId]) {
        colors[trackId] = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
    }
    return colors[trackId];
}

function parseDistances(distancesStr) {
    if (!distancesStr || distancesStr === '[]') {
        return [];
    }
    const distances = distancesStr.slice(1, -1).split('), (');
    return distances.map(pair => {
        const [id, distance] = pair.replace(/[()]/g, '').split(', ');
        return [parseInt(id), parseFloat(distance)];
    });
}

function loadAllCSVFiles() {
    points.length = 0; // clear existing points
    let filesLoaded = 0;

    csvFiles.forEach(fileName => {
        Papa.parse(fileName, {
            download: true,
            header: true,
            complete: function(results) {
                console.log(`CSV Loaded: ${fileName}`, results.data.length, 'rows');
                results.data.forEach((row, index) => {
                    const trackId = row.track_id;
                    trackIds.add(trackId);
                    points.push({
                        track_id: parseInt(row.track_id),
                        frame: parseInt(row.frame),
                        lat: Number(row.gps_y),
                        lng: Number(row.gps_x),
                        color: getColor(trackId),
                        distances: parseDistances(row.distances),
                        instantaneous_speed: Number(row.instantaneous_speed)
                    });
                    if (index === results.data.length - 3) { 
                        maxFrame = Math.max(maxFrame, parseInt(row.frame));  // Update maxFrame to the highest frame number
                    }
                });
                filesLoaded++;
                if (filesLoaded === csvFiles.length) {
                    map.setCenter({ lat: points[0].lat, lng: points[0].lng });
                    drawFrame();
                }
            }
        });
    });
}

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 18,
        center: { lat: 28.59336, lng: -81.208435 },
        mapTypeId: "satellite",
    });
    loadAllCSVFiles();
}

function drawFrame() {
    console.log(`Drawing frame: ${currentFrame}`);
    markers.forEach(marker => marker.setMap(null));
    markers.length = 0;
    lines.forEach(line => line.setMap(null));
    lines.length = 0;
    labels.forEach(label => label.setMap(null)); // Clear old labels
    labels.length = 0;

    const framePoints = points.filter(p => p.frame === currentFrame);
    console.log(`Points in current frame: ${framePoints.length}`);

    framePoints.forEach(point => {
        const marker = new google.maps.Marker({
            position: { lat: point.lat, lng: point.lng },
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 5,
                fillColor: point.color,
                fillOpacity: 1,
                strokeWeight: 0
            }
        });

        markers.push(marker);

        // Check if instantaneous_speed is defined
        if (typeof point.instantaneous_speed !== 'undefined') {
            const labelDiv = document.createElement('div');
            labelDiv.style.position = 'absolute';
            labelDiv.style.background = 'transparent';
            labelDiv.style.color = point.color;
            labelDiv.style.fontSize = '10px';
            labelDiv.style.transform = 'translate(-50%, -100%)';
            labelDiv.textContent = `Speed: ${point.instantaneous_speed.toFixed(2)} m/h`;

            const labelOverlay = new google.maps.OverlayView();
            labelOverlay.onAdd = function() {
                const pane = this.getPanes().overlayLayer;
                pane.appendChild(labelDiv);
            };
            labelOverlay.draw = function() {
                const projection = this.getProjection();
                const position = projection.fromLatLngToDivPixel(marker.getPosition());
                labelDiv.style.left = position.x + 'px';
                labelDiv.style.top = position.y + 'px';
            };
            labelOverlay.onRemove = function() {
                labelDiv.parentNode.removeChild(labelDiv);
            };
            labelOverlay.setMap(map);
            labels.push(labelOverlay);
        }

        // Draw the trail
        for (let i = 1; i <= 25; i = i + 3) {
            const trailFrame = points.find(p => p.frame === (currentFrame - i) && p.track_id === point.track_id);
            if (trailFrame) {
                const trailMarker = new google.maps.Marker({
                    position: { lat: trailFrame.lat, lng: trailFrame.lng },
                    map: map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 5,
                        fillColor: trailFrame.color,
                        fillOpacity: 0.3,
                        strokeWeight: 0
                    }
                });
                markers.push(trailMarker);
            } else {
                break; // No more frames available for this track_id
            }
        }

        point.distances.forEach(distance => {
            const otherPoint = framePoints.find(p => p.track_id === distance[0]);
            if (otherPoint) {
                console.log("reached");
                const line = new google.maps.Polyline({
                    path: [
                        { lat: point.lat, lng: point.lng },
                        { lat: otherPoint.lat, lng: otherPoint.lng }
                    ],
                    geodesic: true,
                    strokeColor: '#000000',
                    strokeOpacity: 1.0,
                    strokeWeight: 1,
                    map: map
                });
                lines.push(line);
            }
        });
    });

    document.getElementById('frameCounter').textContent = `Frame: ${currentFrame}`;
}

function animate() {
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.play();
    function draw() {
        drawFrame();
        currentFrame += 10;
        if (currentFrame >= maxFrame) {
            currentFrame = 0;
            videoPlayer.currentTime = 0;
        }
    }
    animationInterval = setInterval(draw, frameDuration * 10);  // Sync with video
}

document.getElementById('playPauseButton').addEventListener('click', function() {
    const videoPlayer = document.getElementById('videoPlayer');
    if (this.textContent === 'Play') {
        this.textContent = 'Pause';
        animate();
    } else {
        this.textContent = 'Play';
        clearInterval(animationInterval);
        videoPlayer.pause();
    }
});

window.initMap = initMap;

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('prevFrame').addEventListener('click', function() {
        if (currentFrame > 1) {
            currentFrame--;
            drawFrame();
        }
    });
    document.getElementById('nextFrame').addEventListener('click', function() {
        if (currentFrame < maxFrame) {
            currentFrame++;
            drawFrame();
        }
    });
});
