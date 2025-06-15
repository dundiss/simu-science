document.addEventListener('DOMContentLoaded', () => {

    // --- Initialisation du Canvas et Contexte ---
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');

    // Variables pour le centre du radar, qui peut maintenant se déplacer
    let radarCenterX; // Initialisation dans resizeCanvas
    let radarCenterY; // Initialisation dans resizeCanvas
    let radarRadius; // Initialisation dans resizeCanvas

    // --- Éléments d'information et d'alerte ---
    const aircraftIdSpan = document.getElementById('aircraftId');
    const aircraftSpeedSpan = document.getElementById('aircraftSpeed');
    const aircraftHeadingSpan = document.getElementById('aircraftHeading');
    const aircraftAltitudeSpan = document.getElementById('aircraftAltitude');
    const alertsContainer = document.getElementById('alertsContainer');
    const resetPolygonBtn = document.getElementById('resetPolygonBtn');
    const newPolygonBtn = document.getElementById('newPolygonBtn'); 
    const toggleDescriptionBtn = document.getElementById('toggleDescriptionBtn');
    const simulatorDescription = document.getElementById('simulatorDescription');

    // --- Paramètres de Simulation ---
    const NUM_AIRCRAFT = 12;
    const AIRCRAFT_BASE_SIZE = 8;
    const AIRCRAFT_SPEED_MIN_PX_PER_FRAME = 0.5;
    const AIRCRAFT_SPEED_MAX_PX_PER_FRAME = 2.0;
    const AIRCRAFT_ALTITUDE_MIN = 1000;
    const AIRCRAFT_ALTITUDE_MAX = 40000;
    const AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME = 20;
    const RADAR_SWEEP_SPEED = 0.03;
    const MAX_ALERTS = 3;

    const RANDOM_HEADING_CHANGE_MAGNITUDE = 0.05;
    const RANDOM_HEADING_CHANGE_CHANCE = 0.05;
    const CENTRAL_ZONE_RADIUS_RATIO = 0.2;

    const DETERRENCE_ZONE_RADIUS = 60; // Rayon en pixels autour du polygone où la dissuasion s'applique
    const DETERRENCE_STRENGTH = 0.04; // Force du changement de cap (plus grand = plus réactif)

    let aircrafts = [];
    let polygons = [[]]; // CHANGEMENT: un tableau de polygones, initialisé avec un polygone vide
    let currentPolygonIndex = 0; // Index du polygone en cours de dessin

    let radarSweepAngle = 0;
    let animationFrameId;

    // Variables pour le déplacement du radar par l'utilisateur
    let isDraggingRadar = false;
    let dragStartX, dragStartY;
    let initialRadarCenterX, initialRadarCenterY;

    // --- Classe Aircraft (Avion) ---
    class Aircraft {
        constructor(id, x, y, speed, heading, altitude) {
            this.id = id;
            this.x = x;
            this.y = y;
            this.speed = speed;
            this.heading = heading;
            this.color = `hsl(${Math.random() * 360}, 100%, 70%)`;
            this.isVisible = true;

            this.altitude = altitude;
            this.verticalSpeed = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME);
        }

        update() {
            this.x += this.speed * Math.cos(this.heading);
            this.y += this.speed * Math.sin(this.heading);

            this.altitude += this.verticalSpeed;
            if (this.altitude < AIRCRAFT_ALTITUDE_MIN) {
                this.altitude = AIRCRAFT_ALTITUDE_MIN;
                this.verticalSpeed = Math.abs(this.verticalSpeed);
            } else if (this.altitude > AIRCRAFT_ALTITUDE_MAX) {
                this.altitude = AIRCRAFT_ALTITUDE_MAX;
                this.verticalSpeed = -Math.abs(this.verticalSpeed);
            }

            let changedHeading = false;

            // Rebond horizontal et déviation
            if (this.x < 0) {
                this.x = 0;
                this.heading = Math.PI - this.heading;
                changedHeading = true;
            } else if (this.x > canvas.width) {
                this.x = canvas.width;
                this.heading = Math.PI - this.heading;
                changedHeading = true;
            }

            // Rebond vertical et déviation
            if (this.y < 0) {
                this.y = 0;
                this.heading = -this.heading;
                changedHeading = true;
            } else if (this.y > canvas.height) {
                this.y = canvas.height;
                this.heading = -this.heading;
                changedHeading = true;
            }

            this.heading = (this.heading + Math.PI * 2) % (Math.PI * 2);

            // --- Logique de répulsion depuis le centre (pour éviter l'agglomération) ---
            const distFromRadarCenter = Math.sqrt(
                Math.pow(this.x - radarCenterX, 2) + Math.pow(this.y - radarCenterY, 2)
            );
            const centralZoneRadius = radarRadius * CENTRAL_ZONE_RADIUS_RATIO;

            if (distFromRadarCenter < centralZoneRadius) {
                const angleToCenter = Math.atan2(radarCenterY - this.y, radarCenterX - this.x);
                this.heading = angleToCenter + Math.PI + (Math.random() - 0.5) * Math.PI / 2;
                changedHeading = true;
            }

            if (!changedHeading && Math.random() < RANDOM_HEADING_CHANGE_CHANCE) {
                this.heading += (Math.random() - 0.5) * RANDOM_HEADING_CHANGE_MAGNITUDE;
            }
        }

        draw() {
            const altitudeRatio = (this.altitude - AIRCRAFT_ALTITUDE_MIN) / (AIRCRAFT_ALTITUDE_MAX - AIRCRAFT_ALTITUDE_MIN);
            const currentSize = AIRCRAFT_BASE_SIZE * (1 - 0.5 * altitudeRatio);
            const currentAlpha = 1 - 0.4 * altitudeRatio;

            ctx.beginPath();
            ctx.arc(this.x, this.y, currentSize / 2, 0, Math.PI * 2);
            
            const colorParts = this.color.match(/\d+/g);
            ctx.fillStyle = `hsla(${colorParts[0]}, ${colorParts[1]}%, ${colorParts[2]}%, ${currentAlpha})`;
            
            ctx.shadowBlur = 10 * currentAlpha;
            ctx.shadowColor = `hsla(${colorParts[0]}, ${colorParts[1]}%, ${colorParts[2]}%, ${currentAlpha * 0.8})`;
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '7px Arial';
            if (this.verticalSpeed > AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME / 5) {
                ctx.fillText('▲', this.x + currentSize / 2 + 2, this.y + currentSize / 2 + 2);
            } else if (this.verticalSpeed < -AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME / 5) {
                ctx.fillText('▼', this.x + currentSize / 2 + 2, this.y + currentSize / 2 + 2);
            }
        }

        get displaySpeed() {
            return (this.speed * 10).toFixed(0) + ' kts';
        }

        get displayHeading() {
            let degrees = (this.heading * 180 / Math.PI) % 360;
            if (degrees < 0) degrees += 360;
            return degrees.toFixed(0) + '°';
        }

        get displayAltitude() {
            return `${Math.round(this.altitude)} ft`;
        }
    }

    // --- Fonctions de Dessin Radar ---

    function drawRadarBackground() {
        const gradient = ctx.createRadialGradient(radarCenterX, radarCenterY, 0, radarCenterX, radarCenterY, radarRadius);
        gradient.addColorStop(0, 'rgba(0, 255, 0, 0.05)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 255, 0, 0.2)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.arc(radarCenterX, radarCenterY, radarRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#006600';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = '#004400';
        ctx.lineWidth = 1;
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(radarCenterX, radarCenterY, radarRadius * (i / 4), 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.strokeStyle = '#004400';
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI / 6) * i;
            ctx.beginPath();
            ctx.moveTo(radarCenterX, radarCenterY);
            ctx.lineTo(radarCenterX + radarRadius * Math.cos(angle), radarCenterY + radarRadius * Math.sin(angle));
            ctx.stroke();
        }
    }

    function drawRadarSweep() {
        ctx.beginPath();
        ctx.moveTo(radarCenterX, radarCenterY);
        const endX = radarCenterX + radarRadius * Math.cos(radarSweepAngle);
        const endY = radarCenterY + radarRadius * Math.sin(radarSweepAngle);

        const sweepGradient = ctx.createLinearGradient(radarCenterX, radarCenterY, endX, endY);
        sweepGradient.addColorStop(0, 'rgba(0, 255, 0, 0)');
        sweepGradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.7)');
        sweepGradient.addColorStop(1, 'rgba(0, 255, 0, 1)');

        ctx.strokeStyle = sweepGradient;
        ctx.lineWidth = 3;
        ctx.lineTo(endX, endY);
        ctx.stroke();

        radarSweepAngle = (radarSweepAngle + RADAR_SWEEP_SPEED) % (Math.PI * 2);
    }

    // --- Fonctions du Polygone de Surveillance ---

    function drawPolygon() {
        polygons.forEach((polygonPoints, index) => { // Itérer sur tous les polygones
            if (polygonPoints.length < 2) return;

            ctx.beginPath();
            ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
            for (let i = 1; i < polygonPoints.length; i++) {
                ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
            }
            
            // Couleur différente pour le polygone en cours de dessin
            if (index === currentPolygonIndex && polygonPoints.length > 0) {
                ctx.strokeStyle = '#FFFF00'; // Jaune pour celui en cours de dessin
                ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
            } else {
                ctx.strokeStyle = '#FF0000'; // Rouge pour les polygones terminés/anciens
                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            }

            if (polygonPoints.length > 2) {
                ctx.closePath();
                ctx.fill();
            }
            ctx.lineWidth = 2;
            ctx.stroke();

            // Points de contrôle
            ctx.fillStyle = ctx.strokeStyle; // Couleur des points
            polygonPoints.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    }

    function isPointInPolygon(point, polygon) {
        if (polygon.length < 3) return false;

        let x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            let xi = polygon[i].x, yi = polygon[i].y;
            let xj = polygon[j].x, yj = polygon[j].y;

            let intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function distPointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;

        let t = 0;
        if (lenSq > 0) {
            t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
        }

        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;

        const distDx = px - closestX;
        const distDy = py - closestY;

        return Math.sqrt(distDx * distDx + distDy * distDy);
    }

    // --- Gestion des Alertes ---
    let activeAlerts = new Map();

    function addAlert(aircraftId) {
        if (activeAlerts.has(aircraftId)) return;

        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert';
        alertDiv.textContent = `INTRUSION DÉTECTÉE ! Avion ID: ${aircraftId}`;
        alertsContainer.prepend(alertDiv);

        while (alertsContainer.children.length > MAX_ALERTS) {
            alertsContainer.removeChild(alertsContainer.lastChild);
        }

        const timeoutId = setTimeout(() => {
            alertDiv.remove();
            activeAlerts.delete(aircraftId);
        }, 5000);
        activeAlerts.set(aircraftId, timeoutId);
    }

    function removeAlert(aircraftId) {
        if (activeAlerts.has(aircraftId)) {
            clearTimeout(activeAlerts.get(aircraftId));
            activeAlerts.delete(aircraftId);
            const alertDivs = alertsContainer.querySelectorAll('.alert');
            alertDivs.forEach(div => {
                if (div.textContent.includes(`Avion ID: ${aircraftId}`)) {
                    div.remove();
                }
            });
        }
    }

    // --- Initialisation des Avions ---
    function initAircrafts() {
        aircrafts = [];
        for (let i = 0; i < NUM_AIRCRAFT; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const speed = AIRCRAFT_SPEED_MIN_PX_PER_FRAME + Math.random() * (AIRCRAFT_SPEED_MAX_PX_PER_FRAME - AIRCRAFT_SPEED_MIN_PX_PER_FRAME);
            const heading = Math.random() * Math.PI * 2;
            const altitude = AIRCRAFT_ALTITUDE_MIN + Math.random() * (AIRCRAFT_ALTITUDE_MAX - AIRCRAFT_ALTITUDE_MIN);
            aircrafts.push(new Aircraft(`AC-${i + 1}`, x, y, speed, heading, altitude));
        }
    }

    // --- Fonction de Redimensionnement ---
    let oldCanvasWidth = canvas.width;
    let oldCanvasHeight = canvas.height;

    function resizeCanvas() {
        const displayWidth = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        const newCanvasWidth = Math.max(displayWidth, 100);
        const newCanvasHeight = Math.max(displayHeight, 100);

        if (canvas.width === newCanvasWidth && canvas.height === newCanvasHeight) {
            return;
        }

        oldCanvasWidth = canvas.width;
        oldCanvasHeight = canvas.height;

        canvas.width = newCanvasWidth;
        canvas.height = newCanvasHeight;

        radarCenterX = canvas.width / 2;
        radarCenterY = canvas.height / 2;
        radarRadius = Math.max(10, Math.min(radarCenterX, radarCenterY) - 20);

        if (isNaN(radarCenterX) || !isFinite(radarCenterX) ||
            isNaN(radarCenterY) || !isFinite(radarCenterY) ||
            isNaN(radarRadius) || !isFinite(radarRadius)) {
            console.error("CRITICAL ERROR: Radar dimensions are not finite numbers after resizeCanvas!");
            console.error({radarCenterX, radarCenterY, radarRadius, displayWidth, displayHeight, newCanvasWidth, newCanvasHeight});
            cancelAnimationFrame(animationFrameId);
            return;
        }

        if (oldCanvasWidth > 0 && oldCanvasHeight > 0) {
            aircrafts.forEach(aircraft => {
                aircraft.x = (aircraft.x / oldCanvasWidth) * canvas.width;
                aircraft.y = (aircraft.y / oldCanvasHeight) * canvas.height;
            });

            // CHANGEMENT: Itérer sur tous les polygones pour redimensionner leurs points
            polygons.forEach(polygonPoints => {
                polygonPoints.forEach(p => {
                    p.x = (p.x / oldCanvasWidth) * canvas.width;
                    p.y = (p.y / oldCanvasHeight) * canvas.height;
                });
            });
        } else {
            console.warn("Initial canvas dimensions were invalid, re-initializing aircrafts and clearing polygon.");
            initAircrafts();
            polygons = [[]]; // CHANGEMENT: réinitialiser à un polygone vide
            currentPolygonIndex = 0;
        }
    }

    // --- Boucle d'Animation ---
    function animate() {
        resizeCanvas();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isNaN(radarCenterX) || !isFinite(radarCenterX) ||
            isNaN(radarCenterY) || !isFinite(radarCenterY) ||
            isNaN(radarRadius) || !isFinite(radarRadius)) {
            console.error("CRITICAL ERROR: Radar dimensions are not finite numbers before drawRadarBackground!");
            console.error({radarCenterX, radarCenterY, radarRadius});
            cancelAnimationFrame(animationFrameId);
            return;
        }
        drawRadarBackground();

        let displayedAircraft = null;

        aircrafts.forEach(aircraft => {
            aircraft.update();
            aircraft.draw();

            let isAnywhereInPolygon = false;
            let isAnywhereInDeterrenceZone = false;
            let closestPointOnAnyPolygon = {x: 0, y: 0};
            let minDistanceToAnyPolygon = Infinity;
            let currentPolygonPolyCenter = {x: 0, y: 0}; // Pour la répulsion des intrus

            // Parcourir tous les polygones pour cet avion
            polygons.forEach((polygonPoints) => {
                if (polygonPoints.length < 2) return; // Un polygone doit avoir au moins 2 points

                // 1. Vérifier si l'avion est DANS ce polygone
                const isInCurrentPolygon = polygonPoints.length > 2 && isPointInPolygon({ x: aircraft.x, y: aircraft.y }, polygonPoints);
                if (isInCurrentPolygon) {
                    isAnywhereInPolygon = true; // L'avion est dans AU MOINS UN polygone
                    
                    // Si l'avion est DANS un polygone, on calcule le centre de ce polygone pour la répulsion
                    currentPolygonPolyCenter.x = polygonPoints.reduce((sum, p) => sum + p.x, 0) / polygonPoints.length;
                    currentPolygonPolyCenter.y = polygonPoints.reduce((sum, p) => sum + p.y, 0) / polygonPoints.length;
                }

                // 2. Vérifier la distance à la zone de dissuasion de ce polygone
                if (!isInCurrentPolygon) { // Seulement si pas déjà dans ce polygone
                    let minDistanceToCurrentPolygon = Infinity;
                    let closestPointOnCurrentPolygon = {x: 0, y: 0};

                    for (let i = 0; i < polygonPoints.length; i++) {
                        const p1 = polygonPoints[i];
                        const p2 = polygonPoints[(i + 1) % polygonPoints.length];

                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const lenSq = dx * dx + dy * dy;

                        let t = 0;
                        if (lenSq > 0) {
                            t = ((aircraft.x - p1.x) * dx + (aircraft.y - p1.y) * dy) / lenSq;
                            t = Math.max(0, Math.min(1, t));
                        }
                        const currentClosestX = p1.x + t * dx;
                        const currentClosestY = p1.y + t * dy;

                        const currentDist = Math.sqrt(Math.pow(aircraft.x - currentClosestX, 2) + Math.pow(aircraft.y - currentClosestY, 2));

                        if (currentDist < minDistanceToCurrentPolygon) {
                            minDistanceToCurrentPolygon = currentDist;
                            closestPointOnCurrentPolygon.x = currentClosestX;
                            closestPointOnCurrentPolygon.y = currentClosestY;
                        }
                    }

                    // Garder la plus petite distance et le point le plus proche de TOUS les polygones
                    if (minDistanceToCurrentPolygon < minDistanceToAnyPolygon) {
                        minDistanceToAnyPolygon = minDistanceToCurrentPolygon;
                        closestPointOnAnyPolygon = closestPointOnCurrentPolygon;
                    }

                    if (minDistanceToCurrentPolygon < DETERRENCE_ZONE_RADIUS) {
                        isAnywhereInDeterrenceZone = true; // L'avion est dans la zone de dissuasion d'AU MOINS UN polygone
                    }
                }
            }); // Fin de forEach sur polygons

            // --- Appliquer les logiques de défense basées sur l'état global ---
            if (isAnywhereInPolygon) {
                addAlert(aircraft.id);
                if (!displayedAircraft) {
                    displayedAircraft = aircraft;
                }

                // L'avion est DANS UN polygone. Forte répulsion.
                const angleAwayFromPolygonCenter = Math.atan2(aircraft.y - currentPolygonPolyCenter.y, aircraft.x - currentPolygonPolyCenter.x);
                aircraft.heading = angleAwayFromPolygonCenter;
                aircraft.speed = AIRCRAFT_SPEED_MAX_PX_PER_FRAME * 1.5; // Accélère la fuite

            } else if (isAnywhereInDeterrenceZone) {
                // L'avion est DANS LA ZONE DE DISSUASION (mais pas dans un polygone)
                if (activeAlerts.has(aircraft.id)) { // Enlève l'alerte d'intrusion si elle existait
                    removeAlert(aircraft.id);
                }

                const deterrenceFactor = 1 - (minDistanceToAnyPolygon / DETERRENCE_ZONE_RADIUS);
                
                const angleAwayFromClosestPoint = Math.atan2(aircraft.y - closestPointOnAnyPolygon.y, aircraft.x - closestPointOnAnyPolygon.x);
                const desiredHeadingChange = angleAwayFromClosestPoint - aircraft.heading;
                const normalizedHeadingChange = (desiredHeadingChange + Math.PI * 3) % (Math.PI * 2) - Math.PI;

                aircraft.heading += normalizedHeadingChange * DETERRENCE_STRENGTH * deterrenceFactor;

            } else {
                // L'avion n'est dans aucun polygone ni aucune zone de dissuasion
                if (activeAlerts.has(aircraft.id)) {
                    removeAlert(aircraft.id);
                }
            }

            // Affichage des informations de l'avion le plus proche du radar
            if (!displayedAircraft) {
                const dist = Math.sqrt(Math.pow(aircraft.x - radarCenterX, 2) + Math.pow(aircraft.y - radarCenterY, 2));
                if (dist < radarRadius) {
                    if (!displayedAircraft || dist < Math.sqrt(Math.pow(displayedAircraft.x - radarCenterX, 2) + Math.pow(displayedAircraft.y - radarCenterY, 2))) {
                        displayedAircraft = aircraft;
                    }
                }
            }
        });

        drawPolygon();

        if (displayedAircraft) {
            aircraftIdSpan.textContent = displayedAircraft.id;
            aircraftSpeedSpan.textContent = displayedAircraft.displaySpeed;
            aircraftHeadingSpan.textContent = displayedAircraft.displayHeading;
            aircraftAltitudeSpan.textContent = displayedAircraft.displayAltitude;
        } else {
            aircraftIdSpan.textContent = 'N/A';
            aircraftSpeedSpan.textContent = 'N/A';
            aircraftHeadingSpan.textContent = 'N/A';
            aircraftAltitudeSpan.textContent = 'N/A';
        }

        drawRadarSweep();

        animationFrameId = requestAnimationFrame(animate);
    }

    // --- Événements Utilisateur ---

    canvas.addEventListener('click', (event) => {
        if (!isDraggingRadar) {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            polygons[currentPolygonIndex].push({ x, y }); // Ajouter au polygone ACTUEL
        }
    });

    canvas.addEventListener('dblclick', () => {
        // Un double-clic finalise le polygone courant et en prépare un nouveau
        // si le polygone courant a au moins 3 points
        if (polygons[currentPolygonIndex].length >= 3) {
            polygons.push([]); // Ajouter un nouveau tableau vide pour le prochain polygone
            currentPolygonIndex = polygons.length - 1; // Mettre à jour l'index
            console.log("Polygone terminé. Cliquez pour commencer un nouveau polygone.");
        } else if (polygons[currentPolygonIndex].length > 0) {
            console.warn("Le polygone actuel doit avoir au moins 3 points pour être considéré comme terminé.");
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'r' || event.key === 'R') {
            polygons = [[]]; // Réinitialiser TOUS les polygones à un seul polygone vide
            currentPolygonIndex = 0;
            activeAlerts.forEach(timeoutId => clearTimeout(timeoutId));
            activeAlerts.clear();
            alertsContainer.innerHTML = '';
        }
    });

    resetPolygonBtn.addEventListener('click', () => {
        polygons = [[]]; // Réinitialiser TOUS les polygones à un seul polygone vide
        currentPolygonIndex = 0;
        activeAlerts.forEach(timeoutId => clearTimeout(timeoutId));
        activeAlerts.clear();
        alertsContainer.innerHTML = '';
    });

    newPolygonBtn.addEventListener('click', () => {
        // Vérifier si le polygone courant a au moins 3 points avant d'en créer un nouveau
        // ou si le polygone courant est vide.
        if (polygons[currentPolygonIndex].length >= 3 || polygons[currentPolygonIndex].length === 0) {
            polygons.push([]);
            currentPolygonIndex = polygons.length - 1;
            console.log("Nouveau polygone créé. Dessinez les points.");
        } else {
            console.warn("Le polygone actuel doit avoir au moins 3 points ou être vide avant d'en créer un nouveau.");
        }
    });

    toggleDescriptionBtn.addEventListener('click', () => {
        simulatorDescription.classList.toggle('hidden'); // Ajoute ou retire la classe 'hidden'
        if (simulatorDescription.classList.contains('hidden')) {
            toggleDescriptionBtn.textContent = 'Afficher la description';
        } else {
            toggleDescriptionBtn.textContent = 'Masquer la description';
        }
    });

    // --- Gestion du déplacement du radar ---
    function handleCanvasMousedown(event) {
        if (event.button === 2 || event.shiftKey) {
            isDraggingRadar = true;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            initialRadarCenterX = radarCenterX;
            initialRadarCenterY = radarCenterY;
            canvas.style.cursor = 'grabbing';
            event.preventDefault();
        }
    }

    function handleCanvasMousemove(event) {
        if (isDraggingRadar) {
            const deltaX = event.clientX - dragStartX;
            const deltaY = event.clientY - dragStartY;
            radarCenterX = initialRadarCenterX + deltaX;
            radarCenterY = initialRadarCenterY + deltaY;
        }
    }

    function handleCanvasMouseup() {
        isDraggingRadar = false;
        canvas.style.cursor = 'crosshair';
    }

    canvas.addEventListener('mousedown', handleCanvasMousedown);
    canvas.addEventListener('mousemove', handleCanvasMousemove);
    canvas.addEventListener('mouseup', handleCanvasMouseup);

    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    // --- Démarrage de la Simulation ---
    resizeCanvas();
    initAircrafts();
    animate();

}); // Fin de DOMContentLoaded