// script.js

document.addEventListener('DOMContentLoaded', () => {

    // --- Initialisation du Canvas et Contexte ---
    const canvas = document.getElementById('radarCanvas');
    const ctx = canvas.getContext('2d');

    // Variables pour le centre du radar, qui est fixe au centre du canvas visuel
    let radarCenterX;
    let radarCenterY;
    let radarRadius;

    // --- Éléments d'information et d'alerte ---
    const aircraftIdSpan = document.getElementById('aircraftId');
    const aircraftSpeedSpan = document.getElementById('aircraftSpeed');
    const aircraftHeadingSpan = document.getElementById('aircraftHeading');
    const aircraftAltitudeSpan = document.getElementById('aircraftAltitude');
    const alertsContainer = document.getElementById('alertsContainer');
    const resetPolygonBtn = document.getElementById('resetPolygonBtn');

    // Boutons pour les modes et la description
    const newPolygonBtn = document.getElementById('newPolygonBtn');
    const toggleDescriptionBtn = document.getElementById('toggleDescriptionBtn');
    const simulatorDescription = document.getElementById('simulatorDescription');
    const toggleDrawModeBtn = document.getElementById('toggleDrawModeBtn');
    const toggleDragModeBtn = document.getElementById('toggleDragModeBtn');

    // --- Paramètres de Simulation ---
    const NUM_AIRCRAFT = 12;
    const AIRCRAFT_SPEED_MIN_PX_PER_FRAME = 0.5;
    const AIRCRAFT_SPEED_MAX_PX_PER_FRAME = 2.0; // Vous pouvez ajuster cette valeur si les intrusions persistent
    const AIRCRAFT_ALTITUDE_MIN = 1000;
    const AIRCRAFT_ALTITUDE_MAX = 40000;
    const AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME = 20;
    const RADAR_SWEEP_SPEED = 0.03;
    const MAX_ALERTS = 3;

    const RANDOM_HEADING_CHANGE_MAGNITUDE = 0.05;
    const RANDOM_HEADING_CHANGE_CHANCE = 0.05;
    const CENTRAL_ZONE_RADIUS_RATIO = 0.2;

    const DETERRENCE_ZONE_RADIUS = 60;
    const DETERRENCE_STRENGTH = 0.04;

    const INTRUSION_EXPULSION_BUFFER = 5; // Distance en pixels à laquelle l'avion est repoussé hors du polygone

    let aircrafts = [];
    let polygonPoints = []; // Contient les points du polygone en cours de dessin
    let polygons = []; // Contient tous les polygones finalisés
    let radarSweepAngle = 0;
    let animationFrameId;

    // Variables pour le déplacement du radar par l'utilisateur
    let isDraggingRadar = false;
    let dragStartX, dragStartY;
    // initialRadarCenterX/Y représente les coordonnées MONDE qui sont actuellement au centre du radar VISUEL.
    // Cette valeur change lorsque l'utilisateur fait glisser la carte.
    let initialRadarCenterX;
    let initialRadarCenterY;

    // Variables d'état des modes
    let currentMode = 'drag'; // 'drag' ou 'draw'

    // --- Définition des catégories d'objets aériens et de leurs propriétés visuelles ---
    const AIR_OBJECT_CATEGORIES = {
        PLANE: {
            color: '#00FF00', // Vert néon
            size: 8,
            drawType: 'planeIcon'
        },
        HELICOPTER: {
            color: '#FFD700', // Or
            size: 6,
            drawType: 'helicopterIcon'
        },
        DRONE: {
            color: '#FF4500', // Orange-rouge
            size: 5,
            drawType: 'droneIcon'
        },
        UNKNOWN: {
            color: '#808080', // Gris
            size: 7,
            drawType: 'unknownIcon'
        }
    };

    // --- Classe Aircraft (Avion) ---
    class Aircraft {
        constructor(id, x, y, speed, heading, altitude, category = 'PLANE') {
            this.id = id;
            this.x = x; // Coordonnées absolues dans le monde simulé
            this.y = y; // Coordonnées absolues dans le monde simulé
            this.speed = speed;
            this.heading = heading;
            this.isVisible = true;

            this.altitude = altitude;
            this.verticalSpeed = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME);

            this.category = category;
            const categoryProps = AIR_OBJECT_CATEGORIES[category.toUpperCase()] || AIR_OBJECT_CATEGORIES.UNKNOWN;
            this.color = categoryProps.color;
            this.size = categoryProps.size;
            this.drawType = categoryProps.drawType;

            this.isInIntrusionZone = false;
            this.isInDeterrenceZone = false;
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

            // --- Logique de confinement des avions au rayon du radar ---
            const boundaryRadius = radarRadius * 1.1; // Zone de rebond légèrement plus grande que le radar visible

            const distFromInitialRadarCenter = Math.sqrt(
                Math.pow(this.x - initialRadarCenterX, 2) + Math.pow(this.y - initialRadarCenterY, 2)
            );

            if (distFromInitialRadarCenter > boundaryRadius) {
                const angleToCenter = Math.atan2(initialRadarCenterY - this.y, initialRadarCenterX - this.x);

                const angleDifference = (angleToCenter - this.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI;
                const turnFactor = Math.min(1, (distFromInitialRadarCenter - boundaryRadius) / (radarRadius * 0.5));
                this.heading += angleDifference * turnFactor * 0.2;

                this.x = initialRadarCenterX + Math.cos(angleToCenter) * boundaryRadius * 0.95;
                this.y = initialRadarCenterY + Math.sin(angleToCenter) * boundaryRadius * 0.95;

                changedHeading = true;
                this.speed = Math.min(this.speed * 1.05, AIRCRAFT_SPEED_MAX_PX_PER_FRAME * 1.5);

            } else {
                this.speed = Math.max(AIRCRAFT_SPEED_MIN_PX_PER_FRAME, Math.min(this.speed, AIRCRAFT_SPEED_MAX_PX_PER_FRAME));
            }

            this.heading = (this.heading + Math.PI * 2) % (Math.PI * 2);

            // --- Logique de répulsion depuis le centre (pour éviter l'agglomération) ---
            const distFromRadarCenterInitial = Math.sqrt(
                Math.pow(this.x - initialRadarCenterX, 2) + Math.pow(this.y - initialRadarCenterY, 2)
            );
            const centralZoneRadius = radarRadius * CENTRAL_ZONE_RADIUS_RATIO;

            if (distFromRadarCenterInitial < centralZoneRadius) {
                const angleToCenter = Math.atan2(initialRadarCenterY - this.y, initialRadarCenterX - this.x);
                this.heading = angleToCenter + Math.PI + (Math.random() - 0.5) * Math.PI / 2;
                changedHeading = true;
            }

            if (!changedHeading && Math.random() < RANDOM_HEADING_CHANGE_CHANCE) {
                this.heading += (Math.random() - 0.5) * RANDOM_HEADING_CHANGE_MAGNITUDE;
            }
        }

        draw(displayedAircraft) {
            // Calculer la position de l'avion sur le canvas, en tenant compte du déplacement du radar
            const displayX = radarCenterX + (this.x - initialRadarCenterX);
            const displayY = radarCenterY + (this.y - initialRadarCenterY);

            // Vérifie si l'avion est dans le rayon d'affichage du radar
            const distFromCanvasCenter = Math.sqrt(
                Math.pow(displayX - radarCenterX, 2) + Math.pow(displayY - radarCenterY, 2)
            );

            if (distFromCanvasCenter <= radarRadius) {
                const altitudeRatio = (this.altitude - AIRCRAFT_ALTITUDE_MIN) / (AIRCRAFT_ALTITUDE_MAX - AIRCRAFT_ALTITUDE_MIN);
                const currentAlpha = 1 - 0.4 * altitudeRatio;

                ctx.save();
                ctx.translate(displayX, displayY);

                const rotationAngle = this.heading - Math.PI / 2;
                ctx.rotate(rotationAngle);

                ctx.fillStyle = this.color;
                ctx.shadowBlur = 10 * currentAlpha;
                ctx.shadowColor = this.color;

                const iconSize = this.size * (1 - 0.5 * altitudeRatio);
                switch (this.drawType) {
                    case 'planeIcon':
                        drawPlaneIcon(ctx, iconSize);
                        break;
                    case 'helicopterIcon':
                        drawHelicopterIcon(ctx, iconSize);
                        break;
                    case 'droneIcon':
                        drawDroneIcon(ctx, iconSize);
                        break;
                    case 'unknownIcon':
                    default:
                        drawUnknownIcon(ctx, iconSize);
                        break;
                }

                ctx.shadowBlur = 0;
                ctx.restore();

                if (this === displayedAircraft) {
                    ctx.beginPath();
                    ctx.arc(displayX, displayY, iconSize + 4, 0, Math.PI * 2);
                    ctx.strokeStyle = '#FFFF00';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.closePath();
                }

                ctx.fillStyle = '#FFFFFF';
                ctx.font = '7px Arial';
                ctx.fillText(this.id, displayX + iconSize / 2 + 2, displayY + iconSize / 2 + 2);

                if (this.verticalSpeed > AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME / 5) {
                    ctx.fillText('▲', displayX - iconSize / 2 - 8, displayY + iconSize / 2 + 2);
                } else if (this.verticalSpeed < -AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME / 5) {
                    ctx.fillText('▼', displayX - iconSize / 2 - 8, displayY + iconSize / 2 + 2);
                }
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

    // --- Fonctions d'Aide pour le Dessin des Icônes ---
    function drawPlaneIcon(ctx, size) {
        const wingLength = size * 1.5;
        const bodyWidth = size / 3;
        ctx.beginPath();
        ctx.rect(-bodyWidth / 2, -wingLength / 2, bodyWidth, wingLength);
        ctx.fill();
        ctx.rect(-wingLength / 2, -bodyWidth / 2, wingLength, bodyWidth);
        ctx.fill();
        ctx.closePath();
    }

    function drawHelicopterIcon(ctx, size) {
        ctx.beginPath();
        ctx.arc(0, 0, size / 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.beginPath();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.moveTo(-size * 1.5, 0);
        ctx.lineTo(size * 1.5, 0);
        ctx.stroke();
        ctx.closePath();
        ctx.beginPath();
        ctx.moveTo(0, size / 1.5);
        ctx.lineTo(0, size);
        ctx.stroke();
        ctx.closePath();
    }

    function drawDroneIcon(ctx, size) {
        const armLength = size * 0.8;
        const propellerSize = size / 3;
        ctx.beginPath();
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size / 2, 0);
        ctx.lineTo(0, size / 2);
        ctx.lineTo(-size / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(armLength / 2, -armLength / 2, propellerSize, 0, Math.PI * 2); ctx.fill();
        ctx.arc(-armLength / 2, -armLength / 2, propellerSize, 0, Math.PI * 2); ctx.fill();
        ctx.arc(armLength / 2, armLength / 2, propellerSize, 0, Math.PI * 2); ctx.fill();
        ctx.arc(-armLength / 2, armLength / 2, propellerSize, 0, Math.PI * 2); ctx.fill();
        ctx.closePath();
    }

    function drawUnknownIcon(ctx, size) {
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(-size / 2, -size / 2);
        ctx.lineTo(size / 2, -size / 2);
        ctx.closePath();
        ctx.fill();
    }

    // --- Fonctions de Dessin Radar ---
    function drawRadarBackground() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        // --- Dessin du cercle de confinement pour le débogage ---
        const boundaryRadius = radarRadius * 1.1; // Doit correspondre à la valeur dans Aircraft.update()

        ctx.beginPath();
        ctx.arc(radarCenterX, radarCenterY, boundaryRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // Jaune transparent
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]); // Ligne pointillée
        ctx.stroke();
        ctx.setLineDash([]); // Réinitialise le style de ligne
        // --- FIN NOUVEAU ---
    }

    function drawRadarSweep() {
        // --- Dessin du sillage du balayage (la trace lumineuse) ---
        ctx.save();
        ctx.beginPath();
        ctx.arc(radarCenterX, radarCenterY, radarRadius, radarSweepAngle - Math.PI / 2, radarSweepAngle); // Dessine un arc pour le sillage
        ctx.lineTo(radarCenterX, radarCenterY); // Retour au centre pour fermer la forme
        ctx.closePath();

        const trailGradient = ctx.createRadialGradient(
            radarCenterX, radarCenterY, 0,
            radarCenterX, radarCenterY, radarRadius
        );
        trailGradient.addColorStop(0, 'rgba(0, 255, 0, 0)');
        trailGradient.addColorStop(0.1, 'rgba(0, 255, 0, 0.05)');
        trailGradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.2)');
        trailGradient.addColorStop(1, 'rgba(0, 255, 0, 0.4)');

        ctx.fillStyle = trailGradient;
        ctx.fill();
        ctx.restore();

        // --- Dessin de la ligne de balayage (le "bras" actuel) ---
        ctx.beginPath();
        ctx.moveTo(radarCenterX, radarCenterY);
        const endX = radarCenterX + radarRadius * Math.cos(radarSweepAngle);
        const endY = radarCenterY + radarRadius * Math.sin(radarSweepAngle);

        const sweepLineGradient = ctx.createLinearGradient(radarCenterX, radarCenterY, endX, endY);
        sweepLineGradient.addColorStop(0, 'rgba(0, 255, 0, 0)');
        sweepLineGradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.7)');
        sweepLineGradient.addColorStop(1, 'rgba(0, 255, 0, 1)');

        ctx.strokeStyle = sweepLineGradient;
        ctx.lineWidth = 3;
        ctx.lineTo(endX, endY);
        ctx.stroke();

        radarSweepAngle = (radarSweepAngle + RADAR_SWEEP_SPEED) % (Math.PI * 2);
    }

    // --- Fonctions de Dessin de Polygone Générique ---
    function drawSinglePolygon(polygon, ctx) {
        if (polygon.length < 2) return;

        ctx.beginPath();
        // Ajuste le dessin du polygone avec le décalage du monde
        ctx.moveTo(radarCenterX + (polygon[0].x - initialRadarCenterX),
                   radarCenterY + (polygon[0].y - initialRadarCenterY));

        for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(radarCenterX + (polygon[i].x - initialRadarCenterX),
                       radarCenterY + (polygon[i].y - initialRadarCenterY));
        }

        // Ferme et remplit uniquement s'il s'agit d'un polygone finalisé ou de celui en cours de dessin (s'il est assez grand)
        if (polygon.length > 2 && (polygon === polygonPoints || polygon[polygon.length - 1] === polygon[0])) {
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.fill();
        }
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#FF0000';
        polygon.forEach(p => {
            ctx.beginPath();
            ctx.arc(radarCenterX + (p.x - initialRadarCenterX),
                    radarCenterY + (p.y - initialRadarCenterY), 4, 0, Math.PI * 2);
            ctx.fill();
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

    function addAlert(message, type = 'info') {
        const alertClass = type === 'critical' ? 'alert critical' : (type === 'warning' ? 'alert warning' : 'alert info');

        let alertKey;
        if (message.includes("Avion ID:")) {
            const aircraftIdMatch = message.match(/Avion ID: (AC-\d+)/);
            alertKey = aircraftIdMatch ? aircraftIdMatch[1] + '_' + type : message;
        } else {
            alertKey = message + '_' + type;
        }

        if (activeAlerts.has(alertKey)) return;

        const alertDiv = document.createElement('div');
        alertDiv.className = alertClass;
        alertDiv.textContent = message;
        alertsContainer.prepend(alertDiv);

        while (alertsContainer.children.length > MAX_ALERTS) {
            alertsContainer.removeChild(alertsContainer.lastChild);
        }

        const timeoutId = setTimeout(() => {
            alertDiv.remove();
            activeAlerts.delete(alertKey);
        }, 5000);
        activeAlerts.set(alertKey, timeoutId);
    }

    function removeAlert(aircraftId, type = 'intrusion') {
        const key = aircraftId + '_' + type;
        if (activeAlerts.has(key)) {
            clearTimeout(activeAlerts.get(key));
            activeAlerts.delete(key);
            const alertDivs = alertsContainer.querySelectorAll('.alert');
            alertDivs.forEach(div => {
                const textCheck = type === 'intrusion' ? `Intrusion détectée ! Avion ID: ${aircraftId}` : `Avion ID: ${aircraftId} approche zone!`;
                if (div.textContent.includes(textCheck)) {
                    div.remove();
                }
            });
        }
    }

    // --- Initialisation des Avions ---
    function initAircrafts() {
        aircrafts = [];
        const categories = ['PLANE', 'HELICOPTER', 'DRONE', 'UNKNOWN'];

        // initialRadarCenterX/Y représente les coordonnées du monde qui sont actuellement au centre du radar visuel.
        // Donc, lors de l'apparition, nous voulons apparaître autour de ce point.
        const worldSpawnRefX = initialRadarCenterX;
        const worldSpawnRefY = initialRadarCenterY;

        // Fait apparaître les avions dans un rayon raisonnable autour du centre initial du radar
        const spawnRadius = radarRadius * 1.0; // Les fait apparaître directement dans le radar visible au démarrage

        for (let i = 0; i < NUM_AIRCRAFT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spawnRadius;

            const x = worldSpawnRefX + distance * Math.cos(angle);
            const y = worldSpawnRefY + distance * Math.sin(angle);

            const speed = AIRCRAFT_SPEED_MIN_PX_PER_FRAME + Math.random() * (AIRCRAFT_SPEED_MAX_PX_PER_FRAME - AIRCRAFT_SPEED_MIN_PX_PER_FRAME);
            const heading = Math.random() * Math.PI * 2;
            const altitude = AIRCRAFT_ALTITUDE_MIN + Math.random() * (AIRCRAFT_ALTITUDE_MAX - AIRCRAFT_ALTITUDE_MIN);
            const category = categories[i % categories.length];
            aircrafts.push(new Aircraft(`AC-${i + 1}`, x, y, speed, heading, altitude, category));
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

        // Met à jour les dimensions du canvas
        oldCanvasWidth = canvas.width = newCanvasWidth;
        oldCanvasHeight = canvas.height = newCanvasHeight;

        // Le centre visuel du radar est toujours au milieu du canvas
        radarCenterX = canvas.width / 2;
        radarCenterY = canvas.height / 2;
        radarRadius = Math.max(10, Math.min(radarCenterX, radarCenterY) - 20);

        // Définit initialRadarCenterX/Y une SEULE fois lors du premier chargement
        // Cela définit la coordonnée du monde qui correspond au centre visuel du radar au démarrage.
        if (initialRadarCenterX === undefined || initialRadarCenterY === undefined) {
             initialRadarCenterX = radarCenterX;
             initialRadarCenterY = radarCenterY;
             initAircrafts(); // Crée les avions en se basant sur ce centre du monde initial
             polygons = []; // Réinitialise les polygones stockés
             polygonPoints = []; // Efface le polygone en cours de dessin
        }

        if (isNaN(radarCenterX) || !isFinite(radarCenterX) ||
            isNaN(radarCenterY) || !isFinite(radarCenterY) ||
            isNaN(radarRadius) || !isFinite(radarRadius)) {
            console.error("ERREUR CRITIQUE: Les dimensions du radar ne sont pas des nombres finis après resizeCanvas!");
            console.error({radarCenterX, radarCenterY, radarRadius, displayWidth, displayHeight, newCanvasWidth, newCanvasHeight});
            cancelAnimationFrame(animationFrameId);
            return;
        }
    }

    // --- Boucle d'Animation ---
    function animate() {
        resizeCanvas();

        drawRadarBackground();

        let displayedAircraft = null;

        aircrafts.forEach(aircraft => {
            aircraft.update();

            let isIntrudedByAnyPolygon = false;
            let isDissuadedByAnyPolygon = false;

            aircraft.isInIntrusionZone = false; // Réinitialise les drapeaux pour la frame actuelle
            aircraft.isInDeterrenceZone = false;

            // Vérifie par rapport à tous les polygones finalisés PLUS celui en cours de dessin
            const allPolygons = [...polygons];
            if (polygonPoints.length >= 2) {
                allPolygons.push(polygonPoints);
            }

            allPolygons.forEach((polygon) => {
                const isPolygonUsableForDetection = polygon.length >= 3 && polygon[polygon.length - 1] === polygon[0];

                if (!isPolygonUsableForDetection && polygon !== polygonPoints) return;

                const isInPolygon = isPointInPolygon({ x: aircraft.x, y: aircraft.y }, polygon);

                if (isInPolygon && isPolygonUsableForDetection) {
                    addAlert(`ALERTE: Intrusion détectée ! Avion ID: ${aircraft.id}`, 'critical');
                    removeAlert(aircraft.id, 'approach');

                    // --- NOUVELLE LOGIQUE D'EXPULSION IMMÉDIATE ---
                    if (!aircraft.isInIntrusionZone) { // Agit seulement la première fois qu'il est détecté dans la zone
                        let minDistanceToPolygon = Infinity;
                        let closestPointOnPolygon = { x: 0, y: 0 };

                        const numSegments = polygon.length; // Pour un polygone fermé
                        for (let i = 0; i < numSegments; i++) {
                            const p1 = polygon[i];
                            const p2 = polygon[(i + 1) % numSegments]; // Boucle sur le dernier segment

                            const currentDist = distPointToSegment(aircraft.x, aircraft.y, p1.x, p1.y, p2.x, p2.y);

                            if (currentDist < minDistanceToPolygon) {
                                minDistanceToPolygon = currentDist;
                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const lenSq = dx * dx + dy * dy;
                                let t = 0;
                                if (lenSq > 0) {
                                    t = ((aircraft.x - p1.x) * dx + (aircraft.y - p1.y) * dy) / lenSq;
                                    t = Math.max(0, Math.min(1, t));
                                }
                                closestPointOnPolygon.x = p1.x + t * dx;
                                closestPointOnPolygon.y = p1.y + t * dy;
                            }
                        }

                        // Repositionner l'avion juste à l'extérieur du polygone
                        if (minDistanceToPolygon < Infinity) {
                            const vectorFromClosestPoint = { x: aircraft.x - closestPointOnPolygon.x, y: aircraft.y - closestPointOnPolygon.y };
                            const magnitude = Math.sqrt(vectorFromClosestPoint.x * vectorFromClosestPoint.x + vectorFromClosestPoint.y * vectorFromClosestPoint.y);

                            // Calculer la direction "outward" (vers l'extérieur du polygone)
                            let normalAngle;
                            if (magnitude > 0.001) { // Éviter la division par zéro
                                normalAngle = Math.atan2(vectorFromClosestPoint.y / magnitude, vectorFromClosestPoint.x / magnitude);
                            } else {
                                // Si l'avion est exactement sur le point le plus proche, repousser depuis le centre du polygone
                                let polyCenterX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
                                let polyCenterY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;
                                normalAngle = Math.atan2(aircraft.y - polyCenterY, aircraft.x - polyCenterX);
                            }

                            aircraft.x = closestPointOnPolygon.x + Math.cos(normalAngle) * INTRUSION_EXPULSION_BUFFER;
                            aircraft.y = closestPointOnPolygon.y + Math.sin(normalAngle) * INTRUSION_EXPULSION_BUFFER;

                            // Orienter l'avion dans la direction de l'expulsion
                            aircraft.heading = normalAngle;
                            // Augmenter la vitesse pour qu'il sorte plus vite
                            aircraft.speed = AIRCRAFT_SPEED_MAX_PX_PER_FRAME * 2; // Vitesse plus élevée pour l'expulsion
                        }
                    }
                    aircraft.isInIntrusionZone = true;
                    isIntrudedByAnyPolygon = true;
                } else {
                    removeAlert(aircraft.id, 'intrusion');

                    if (!isIntrudedByAnyPolygon) {
                        let minDistanceToPolygon = Infinity;
                        let closestPointOnPolygon = { x: 0, y: 0 };

                        const numSegments = isPolygonUsableForDetection ? polygon.length : polygon.length - 1;
                        for (let i = 0; i < numSegments; i++) {
                            const p1 = polygon[i];
                            const p2 = polygon[(i + 1) % polygon.length];

                            const currentDist = distPointToSegment(aircraft.x, aircraft.y, p1.x, p1.y, p2.x, p2.y);

                            if (currentDist < minDistanceToPolygon) {
                                minDistanceToPolygon = currentDist;
                                const dx = p2.x - p1.x;
                                const dy = p2.y - p1.y;
                                const lenSq = dx * dx + dy * dy;
                                let t = 0;
                                if (lenSq > 0) {
                                    t = ((aircraft.x - p1.x) * dx + (aircraft.y - p1.y) * dy) / lenSq;
                                    t = Math.max(0, Math.min(1, t));
                                }
                                closestPointOnPolygon.x = p1.x + t * dx;
                                closestPointOnPolygon.y = p1.y + t * dy;
                            }
                        }

                        if (minDistanceToPolygon < DETERRENCE_ZONE_RADIUS) {
                            addAlert(`ATTENTION: Avion ID: ${aircraft.id} approche zone!`, 'warning');

                            if (!aircraft.isInDeterrenceZone) {
                                const deterrenceFactor = 1 - (minDistanceToPolygon / DETERRENCE_ZONE_RADIUS);
                                const angleAwayFromClosestPoint = Math.atan2(aircraft.y - closestPointOnPolygon.y, aircraft.x - closestPointOnPolygon.x);
                                const desiredHeadingChange = angleAwayFromClosestPoint - aircraft.heading;
                                const normalizedHeadingChange = (desiredHeadingChange + Math.PI * 3) % (Math.PI * 2) - Math.PI;
                                aircraft.heading += normalizedHeadingChange * DETERRENCE_STRENGTH * deterrenceFactor;
                                aircraft.speed = AIRCRAFT_SPEED_MIN_PX_PER_FRAME + (AIRCRAFT_SPEED_MAX_PX_PER_FRAME - AIRCRAFT_SPEED_MIN_PX_PER_FRAME) * deterrenceFactor;
                            }
                            aircraft.isInDeterrenceZone = true;
                            isDissuadedByAnyPolygon = true;
                        } else {
                            removeAlert(aircraft.id, 'approach');
                        }
                    }
                }
            });

            // Réinitialise les drapeaux si plus dans aucune zone
            if (!isIntrudedByAnyPolygon) {
                aircraft.isInIntrusionZone = false;
            }
            if (!isDissuadedByAnyPolygon && !isIntrudedByAnyPolygon) {
                aircraft.isInDeterrenceZone = false;
            }

            // Trouve l'avion le plus proche du centre visuel du radar pour l'affichage des infos
            const displayX = radarCenterX + (aircraft.x - initialRadarCenterX);
            const displayY = radarCenterY + (aircraft.y - initialRadarCenterY);

            const distToCanvasCenter = Math.sqrt(
                Math.pow(displayX - radarCenterX, 2) + Math.pow(displayY - radarCenterY, 2)
            );

            if (distToCanvasCenter < radarRadius) {
                if (!displayedAircraft || distToCanvasCenter < Math.sqrt(
                    Math.pow( (radarCenterX + (displayedAircraft.x - initialRadarCenterX)) - radarCenterX, 2) +
                    Math.pow( (radarCenterY + (displayedAircraft.y - initialRadarCenterY)) - radarCenterY, 2)
                )) {
                    displayedAircraft = aircraft;
                }
            }
            aircraft.draw(displayedAircraft);
        });

        // Dessine tous les polygones finalisés
        polygons.forEach(p => drawSinglePolygon(p, ctx));
        // Dessine le polygone en cours de création
        if (polygonPoints.length > 0) {
            drawSinglePolygon(polygonPoints, ctx);
        }

        drawRadarSweep();

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

        animationFrameId = requestAnimationFrame(animate);
    }

    // --- Événements Utilisateur ---

    toggleDescriptionBtn.addEventListener('click', () => {
        simulatorDescription.classList.toggle('hidden');
        if (simulatorDescription.classList.contains('hidden')) {
            toggleDescriptionBtn.textContent = 'Afficher la description';
        } else {
            toggleDescriptionBtn.textContent = 'Masquer la description';
        }
    });

    function handleCanvasClickForPolygon(event) {
        if (currentMode !== 'draw' || isDraggingRadar) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Convertit les coordonnées du canvas en coordonnées du "monde" radar
        const worldX = initialRadarCenterX + (x - radarCenterX);
        const worldY = initialRadarCenterY + (y - radarCenterY);

        polygonPoints.push({ x: worldX, y: worldY });

        // Double-clic pour finaliser le polygone
        if (event.detail === 2) {
            if (polygonPoints.length >= 3) {
                polygonPoints.push(polygonPoints[0]); // Ferme le polygone
                polygons.push(polygonPoints); // Ajoute aux polygones finalisés
                addAlert(`Polygone ${polygons.length} créé avec ${polygonPoints.length - 1} points.`, 'info');
            } else {
                addAlert('Un polygone doit avoir au moins 3 points pour être finalisé.', 'warning');
            }
            polygonPoints = []; // Réinitialise le polygone actuel pour un nouveau dessin
        }
    }
    canvas.addEventListener('click', handleCanvasClickForPolygon);


    // Glissement du radar (souris et tactile)
    function handleStartDrag(event) {
        if (currentMode === 'drag') {
            let clientX, clientY;
            if (event.touches && event.touches.length === 1) {
                clientX = event.touches[0].clientX;
                clientY = event.touches[0].clientY;
            } else if (event.button === 2 || event.shiftKey) { // Clic droit ou Maj + clic gauche
                clientX = event.clientX;
                clientY = event.clientY;
            } else {
                return;
            }

            isDraggingRadar = true;
            dragStartX = clientX;
            dragStartY = clientY;
            canvas.style.cursor = 'grabbing';
            event.preventDefault();
        }
    }

    function handleMoveDrag(event) {
        if (isDraggingRadar && currentMode === 'drag') {
            const currentX = event.clientX || event.touches[0].clientX;
            const currentY = event.clientY || event.touches[0].clientY;

            const deltaX = currentX - dragStartX;
            const deltaY = currentY - dragStartY;

            // Déplace le MONDE SIMULÉ sous le radar
            initialRadarCenterX -= deltaX;
            initialRadarCenterY -= deltaY;

            dragStartX = currentX;
            dragStartY = currentY;
            event.preventDefault();
        }
    }

    function handleEndDrag() {
        isDraggingRadar = false;
        if (currentMode === 'drag') {
            canvas.style.cursor = 'grab';
        }
    }

    canvas.addEventListener('mousedown', handleStartDrag);
    canvas.addEventListener('touchstart', handleStartDrag, { passive: false });
    canvas.addEventListener('mousemove', handleMoveDrag);
    canvas.addEventListener('touchmove', handleMoveDrag, { passive: false });
    document.addEventListener('mouseup', handleEndDrag);
    document.addEventListener('touchend', handleEndDrag);

    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    // --- Gestion des boutons de mode ---
    toggleDrawModeBtn.addEventListener('click', () => {
        currentMode = 'draw';
        addAlert('Mode Dessin de Polygone activé. Cliquez pour ajouter des points. Double-clic pour finaliser.', 'info');
        toggleDrawModeBtn.classList.add('active-mode');
        toggleDragModeBtn.classList.remove('active-mode');
        canvas.style.cursor = 'crosshair';
        polygonPoints = []; // Efface tout polygone partiellement dessiné lors du changement de mode
    });

    toggleDragModeBtn.addEventListener('click', () => {
        currentMode = 'drag';
        addAlert('Mode Déplacement du Radar activé. Utilisez le clic droit/Shift+clic ou glissez un doigt.', 'info');
        toggleDragModeBtn.classList.add('active-mode');
        toggleDrawModeBtn.classList.remove('active-mode');
        canvas.style.cursor = 'grab';
        polygonPoints = []; // Efface tout polygone partiellement dessiné lors du changement de mode
    });

    // --- Gestion des autres boutons de contrôle ---
    resetPolygonBtn.addEventListener('click', () => {
        polygons = [];
        polygonPoints = [];
        activeAlerts.forEach((timeoutId, key) => clearTimeout(timeoutId));
        activeAlerts.clear();
        alertsContainer.innerHTML = '';
        addAlert('Tous les polygones ont été réinitialisés.', 'info');
    });

    if (newPolygonBtn) {
        newPolygonBtn.addEventListener('click', () => {
            if (polygonPoints.length >= 3) {
                polygonPoints.push(polygonPoints[0]);
                polygons.push(polygonPoints);
                addAlert(`Polygone ${polygons.length} créé avec ${polygonPoints.length - 1} points.`, 'info');
            } else if (polygonPoints.length > 0) {
                addAlert('Un polygone doit avoir au moins 3 points pour être finalisé.', 'warning');
            }
            polygonPoints = [];
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'r' || event.key === 'R') {
            resetPolygonBtn.click();
        }
    });

    // --- Démarrage de la Simulation ---
    resizeCanvas(); // Cet appel va maintenant aussi initialiser initialRadarCenterX/Y et appeler initAircrafts()
    toggleDragModeBtn.click(); // Active le mode glisser-déposer par défaut
    animate();

}); // Fin de DOMContentLoaded