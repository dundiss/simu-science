// --- Initialisation du Canvas et Contexte ---
const canvas = document.getElementById('radarCanvas');
const ctx = canvas.getContext('2d');

// Variables pour le centre du radar, qui peut maintenant se déplacer
let radarCenterX = canvas.width / 2;
let radarCenterY = canvas.height / 2;
const radarRadius = Math.min(canvas.width / 2, canvas.height / 2) - 20; // Rayon max du radar basé sur la taille du canvas

// --- Éléments d'information et d'alerte ---
const aircraftIdSpan = document.getElementById('aircraftId');
const aircraftSpeedSpan = document.getElementById('aircraftSpeed');
const aircraftHeadingSpan = document.getElementById('aircraftHeading');
const aircraftAltitudeSpan = document.getElementById('aircraftAltitude'); // Ajouté pour l'altitude
const alertsContainer = document.getElementById('alertsContainer');
const resetPolygonBtn = document.getElementById('resetPolygonBtn');

// --- Paramètres de Simulation ---
const NUM_AIRCRAFT = 12; // Augmenté pour un peu plus de trafic
const AIRCRAFT_BASE_SIZE = 8; // Renommé pour l'échelle d'altitude
const AIRCRAFT_SPEED_MIN_PX_PER_FRAME = 0.5; // px/frame
const AIRCRAFT_SPEED_MAX_PX_PER_FRAME = 2.0; // px/frame
const AIRCRAFT_ALTITUDE_MIN = 1000; // Altitude minimale en pieds
const AIRCRAFT_ALTITUDE_MAX = 40000; // Altitude maximale en pieds
const AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME = 20; // Taux de changement d'altitude
const RADAR_SWEEP_SPEED = 0.03; // Vitesse de la ligne de balayage du radar (radians/frame)
const MAX_ALERTS = 3; // Nombre max d'alertes affichées

// Paramètres de mouvement pour éviter l'agglomération
const RANDOM_HEADING_CHANGE_MAGNITUDE = 0.05; // Amplitude plus grande des déviations aléatoires
const RANDOM_HEADING_CHANGE_CHANCE = 0.05; // Plus de chance de dévier
const CENTRAL_ZONE_RADIUS_RATIO = 0.2; // Ratio du rayon du radar pour définir la zone centrale de répulsion

let aircrafts = [];
let polygonPoints = [];
let radarSweepAngle = 0; // Angle du balayage radar
let animationFrameId; // Pour gérer la boucle d'animation

// Variables pour le déplacement du radar par l'utilisateur
let isDraggingRadar = false;
let dragStartX, dragStartY;
let initialRadarCenterX, initialRadarCenterY; // Pour stocker la position du radar au début du drag

// --- Classe Aircraft (Avion) ---
class Aircraft {
    constructor(id, x, y, speed, heading, altitude) { // Ajout de l'altitude
        this.id = id;
        this.x = x;
        this.y = y;
        this.speed = speed; // Vitesse en pixels par frame
        this.heading = heading; // Cap en radians
        this.color = `hsl(${Math.random() * 360}, 100%, 70%)`; // Couleur aléatoire pour chaque avion
        this.isVisible = true; // Toujours visible dans cette version

        // Ajout de l'altitude
        this.altitude = altitude;
        // Vitesse verticale aléatoire (montée ou descente)
        this.verticalSpeed = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME);
    }

    update() {
        // Mettre à jour la position en fonction de la vitesse et du cap
        this.x += this.speed * Math.cos(this.heading);
        this.y += this.speed * Math.sin(this.heading);

        // Mettre à jour l'altitude
        this.altitude += this.verticalSpeed;
        // Inverser la direction verticale si les limites sont atteintes
        if (this.altitude < AIRCRAFT_ALTITUDE_MIN) {
            this.altitude = AIRCRAFT_ALTITUDE_MIN;
            this.verticalSpeed = Math.abs(this.verticalSpeed); // Remonter
        } else if (this.altitude > AIRCRAFT_ALTITUDE_MAX) {
            this.altitude = AIRCRAFT_ALTITUDE_MAX;
            this.verticalSpeed = -Math.abs(this.verticalSpeed); // Descendre
        }

        // --- Logique de rebond sur les bords du canvas ---
        // et déviation pour éviter l'agglomération

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

        // Normaliser le cap pour qu'il reste dans [0, 2*PI]
        this.heading = (this.heading + Math.PI * 2) % (Math.PI * 2);

        // --- Logique de répulsion depuis le centre (pour éviter l'agglomération) ---
        // Calculer la distance de l'avion au centre du radar actuel
        const distFromRadarCenter = Math.sqrt(
            Math.pow(this.x - radarCenterX, 2) + Math.pow(this.y - radarCenterY, 2)
        );
        const centralZoneRadius = radarRadius * CENTRAL_ZONE_RADIUS_RATIO;

        // Si l'avion est dans la zone centrale de répulsion
        if (distFromRadarCenter < centralZoneRadius) {
            // Calculer l'angle vers le centre
            const angleToCenter = Math.atan2(radarCenterY - this.y, radarCenterX - this.x);
            // Définir un cap qui le pousse hors du centre avec une variation aléatoire
            this.heading = angleToCenter + Math.PI + (Math.random() - 0.5) * Math.PI / 2; // Pousse vers l'extérieur
            changedHeading = true;
        }

        // Ajouter une déviation aléatoire si le cap n'a pas été changé par un rebond ou la répulsion centrale
        if (!changedHeading && Math.random() < RANDOM_HEADING_CHANGE_CHANCE) {
            this.heading += (Math.random() - 0.5) * RANDOM_HEADING_CHANGE_MAGNITUDE;
        }
    }

    draw() {
        // La taille et la transparence dépendent de l'altitude
        const altitudeRatio = (this.altitude - AIRCRAFT_ALTITUDE_MIN) / (AIRCRAFT_ALTITUDE_MAX - AIRCRAFT_ALTITUDE_MIN);
        const currentSize = AIRCRAFT_BASE_SIZE * (1 - 0.5 * altitudeRatio); // Plus petit en altitude
        const currentAlpha = 1 - 0.4 * altitudeRatio; // Moins visible en altitude

        ctx.beginPath();
        ctx.arc(this.x, this.y, currentSize / 2, 0, Math.PI * 2);
        
        // Utiliser hsla pour la transparence
        const colorParts = this.color.match(/\d+/g); // Extrait les nombres de la chaîne hsl()
        ctx.fillStyle = `hsla(${colorParts[0]}, ${colorParts[1]}%, ${colorParts[2]}%, ${currentAlpha})`;
        
        ctx.shadowBlur = 10 * currentAlpha; // Ombre dépend de la transparence
        ctx.shadowColor = `hsla(${colorParts[0]}, ${colorParts[1]}%, ${colorParts[2]}%, ${currentAlpha * 0.8})`;
        ctx.fill();
        ctx.shadowBlur = 0; // Réinitialiser l'ombre

        // Indiquer la montée/descente si la vitesse verticale est significative
        ctx.fillStyle = '#FFFFFF'; // Couleur du texte
        ctx.font = '7px Arial';
        if (this.verticalSpeed > AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME / 5) {
            ctx.fillText('▲', this.x + currentSize / 2 + 2, this.y + currentSize / 2 + 2);
        } else if (this.verticalSpeed < -AIRCRAFT_ALTITUDE_CHANGE_RATE_FT_PER_FRAME / 5) {
            ctx.fillText('▼', this.x + currentSize / 2 + 2, this.y + currentSize / 2 + 2);
        }
    }

    // Calculer la vitesse en "noeuds" pour l'affichage (arbitraire)
    get displaySpeed() {
        // On peut définir une conversion arbitraire de px/frame en noeuds
        // Par exemple, 1 px/frame = 10 noeuds
        return (this.speed * 10).toFixed(0) + ' kts';
    }

    // Calculer le cap en degrés
    get displayHeading() {
        let degrees = (this.heading * 180 / Math.PI) % 360;
        if (degrees < 0) degrees += 360; // Assurer un angle positif
        return degrees.toFixed(0) + '°';
    }

    // Afficher l'altitude
    get displayAltitude() {
        return `${Math.round(this.altitude)} ft`;
    }
}

// --- Fonctions de Dessin Radar ---

function drawRadarBackground() {
    // Fond du radar (dégradé pour l'effet)
    const gradient = ctx.createRadialGradient(radarCenterX, radarCenterY, 0, radarCenterX, radarCenterY, radarRadius);
    gradient.addColorStop(0, 'rgba(0, 255, 0, 0.05)');
    gradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 255, 0, 0.2)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cercle extérieur
    ctx.beginPath();
    ctx.arc(radarCenterX, radarCenterY, radarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#006600'; // Vert foncé pour la bordure
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cercles concentriques
    ctx.strokeStyle = '#004400';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(radarCenterX, radarCenterY, radarRadius * (i / 4), 0, Math.PI * 2);
        ctx.stroke();
    }

    // Lignes de direction
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

    // Créer un dégradé pour la ligne de balayage
    const sweepGradient = ctx.createLinearGradient(radarCenterX, radarCenterY, endX, endY);
    sweepGradient.addColorStop(0, 'rgba(0, 255, 0, 0)');
    sweepGradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.7)');
    sweepGradient.addColorStop(1, 'rgba(0, 255, 0, 1)');

    ctx.strokeStyle = sweepGradient;
    ctx.lineWidth = 3;
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Mettre à jour l'angle pour la prochaine frame
    radarSweepAngle = (radarSweepAngle + RADAR_SWEEP_SPEED) % (Math.PI * 2);
}

// --- Fonctions du Polygone de Surveillance ---

function drawPolygon() {
    if (polygonPoints.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (polygonPoints.length > 2) { // Si le polygone est "fermé" ou en cours de fermeture
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // Rouge transparent pour la zone surveillée
        ctx.fill();
    }
    ctx.strokeStyle = '#FF0000'; // Bordure rouge
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dessiner les points du polygone
    ctx.fillStyle = '#FF0000';
    polygonPoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Algorithme Point-in-Polygon (Ray Casting Algorithm)
function isPointInPolygon(point, polygon) {
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

// --- Gestion des Alertes ---
let activeAlerts = new Map(); // Map(aircraftId -> timeoutId)

function addAlert(aircraftId) {
    if (activeAlerts.has(aircraftId)) return; // Ne pas ajouter la même alerte deux fois

    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
    alertDiv.textContent = `INTRUSION DÉTECTÉE ! Avion ID: ${aircraftId}`;
    alertsContainer.prepend(alertDiv); // Ajouter au début pour les plus récentes

    // Limiter le nombre d'alertes affichées
    while (alertsContainer.children.length > MAX_ALERTS) {
        alertsContainer.removeChild(alertsContainer.lastChild);
    }

    // Supprimer l'alerte après un certain temps (ex: 5 secondes)
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
        // Optionnel: trouver et retirer l'élément div correspondant
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
        const heading = Math.random() * Math.PI * 2; // Angle aléatoire en radians
        const altitude = AIRCRAFT_ALTITUDE_MIN + Math.random() * (AIRCRAFT_ALTITUDE_MAX - AIRCRAFT_ALTITUDE_MIN); // Initialiser l'altitude
        aircrafts.push(new Aircraft(`AC-${i + 1}`, x, y, speed, heading, altitude));
    }
}

// --- Boucle d'Animation ---
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Effacer le canvas

    // Appliquer la transformation pour le déplacement du radar AVANT de dessiner le fond
    // Le fond du radar et le balayage doivent être dessinés en fonction de radarCenterX/Y
    // Les avions et le polygone doivent être dessinés dans le système de coordonnées du canvas
    // La façon la plus simple est d'utiliser `ctx.translate` pour les avions et le polygone.

    drawRadarBackground(); // Dessine le fond du radar à sa position actuelle

    // Appliquer le décalage pour dessiner les avions et le polygone par rapport au centre du radar
    // Ce n'est plus nécessaire de faire un translate global, car le radar bouge.
    // Les avions et polygones doivent juste utiliser leurs coordonnées absolues du canvas.

    let displayedAircraft = null; // Pour afficher les infos de l'avion sélectionné

    // Mettre à jour et dessiner les avions
    aircrafts.forEach(aircraft => {
        aircraft.update();
        aircraft.draw();

        // Vérifier l'intrusion dans le polygone
        if (polygonPoints.length > 2 && isPointInPolygon({ x: aircraft.x, y: aircraft.y }, polygonPoints)) {
            addAlert(aircraft.id);
            // Si c'est le premier avion dans le polygone, afficher ses infos
            if (!displayedAircraft) {
                displayedAircraft = aircraft;
            }
        } else {
            removeAlert(aircraft.id); // L'avion est sorti, retirer l'alerte
        }

        // Si aucun avion n'est dans le polygone, afficher l'avion le plus proche du centre du RADAR ACTUEL
        if (!displayedAircraft) {
             const dist = Math.sqrt(Math.pow(aircraft.x - radarCenterX, 2) + Math.pow(aircraft.y - radarCenterY, 2));
             if (dist < radarRadius) { // Si l'avion est dans la portée du radar
                 if (!displayedAircraft || dist < Math.sqrt(Math.pow(displayedAircraft.x - radarCenterX, 2) + Math.pow(displayedAircraft.y - radarCenterY, 2))) {
                     displayedAircraft = aircraft;
                 }
             }
        }
    });

    drawPolygon(); // Dessine le polygone à ses coordonnées absolues

    // Afficher les informations de l'avion
    if (displayedAircraft) {
        aircraftIdSpan.textContent = displayedAircraft.id;
        aircraftSpeedSpan.textContent = displayedAircraft.displaySpeed;
        aircraftHeadingSpan.textContent = displayedAircraft.displayHeading;
        aircraftAltitudeSpan.textContent = displayedAircraft.displayAltitude; // Afficher l'altitude
    } else {
        aircraftIdSpan.textContent = 'N/A';
        aircraftSpeedSpan.textContent = 'N/A';
        aircraftHeadingSpan.textContent = 'N/A';
        aircraftAltitudeSpan.textContent = 'N/A'; // N/A pour l'altitude aussi
    }

    drawRadarSweep(); // Dessiner le balayage radar par-dessus les avions

    animationFrameId = requestAnimationFrame(animate); // Boucle
}

// --- Événements Utilisateur ---

// Gérer le clic pour ajouter des points au polygone
canvas.addEventListener('click', (event) => {
    // Si nous ne sommes PAS en train de draguer le radar, alors c'est un clic pour le polygone
    if (!isDraggingRadar) {
        const rect = canvas.getBoundingClientRect();
        // Les points du polygone sont en coordonnées absolues du canvas
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        polygonPoints.push({ x, y });
    }
});

// Gérer le double-clic pour fermer le polygone
canvas.addEventListener('dblclick', () => {
    if (polygonPoints.length >= 3) {
        polygonPoints.push(polygonPoints[0]); // Ferme le polygone visuellement
    }
});

// Gérer la touche 'R' pour réinitialiser le polygone
document.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') {
        polygonPoints = [];
        activeAlerts.forEach(timeoutId => clearTimeout(timeoutId));
        activeAlerts.clear();
        alertsContainer.innerHTML = '';
    }
});

// Bouton de réinitialisation du polygone
resetPolygonBtn.addEventListener('click', () => {
    polygonPoints = [];
    activeAlerts.forEach(timeoutId => clearTimeout(timeoutId));
    activeAlerts.clear();
    alertsContainer.innerHTML = '';
});

// --- Gestion du déplacement du radar ---
// Supprimons l'ancien événement mousedown et recréons-en un plus clair.
canvas.removeEventListener('mousedown', handleCanvasMousedown); // Assurez-vous que l'ancien est retiré
canvas.removeEventListener('mousemove', handleCanvasMousemove);
canvas.removeEventListener('mouseup', handleCanvasMouseup);

function handleCanvasMousedown(event) {
    // Clic droit ou Maj + clic gauche pour déplacer le radar
    if (event.button === 2 || event.shiftKey) { 
        isDraggingRadar = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        initialRadarCenterX = radarCenterX; // Stocke la position initiale du radar
        initialRadarCenterY = radarCenterY;
        canvas.style.cursor = 'grabbing';
        event.preventDefault(); // Empêche le menu contextuel du clic droit
    }
    // Le clic gauche pour le polygone est maintenant géré par un eventListener séparé `canvas.addEventListener('click')`
}

function handleCanvasMousemove(event) {
    if (isDraggingRadar) {
        const deltaX = event.clientX - dragStartX;
        const deltaY = event.clientY - dragStartY;
        // Met à jour la position du centre du radar
        radarCenterX = initialRadarCenterX + deltaX;
        radarCenterY = initialRadarCenterY + deltaY;
    }
}

function handleCanvasMouseup() {
    isDraggingRadar = false;
    canvas.style.cursor = 'crosshair'; // Revenir au curseur normal
}

// Attacher les nouveaux gestionnaires d'événements
canvas.addEventListener('mousedown', handleCanvasMousedown);
canvas.addEventListener('mousemove', handleCanvasMousemove);
canvas.addEventListener('mouseup', handleCanvasMouseup);


// Empêcher le menu contextuel sur le canvas pour le clic droit
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// --- Démarrage de la Simulation ---
initAircrafts();
animate(); // Lancer la boucle d'animation