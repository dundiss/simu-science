// --- Initialisation du Canvas et Contexte ---
const canvas = document.getElementById('radarCanvas');
const ctx = canvas.getContext('2d');
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const radarRadius = Math.min(centerX, centerY) - 20; // Rayon max du radar

// --- Éléments d'information et d'alerte ---
const aircraftIdSpan = document.getElementById('aircraftId');
const aircraftSpeedSpan = document.getElementById('aircraftSpeed');
const aircraftHeadingSpan = document.getElementById('aircraftHeading');
const alertsContainer = document.getElementById('alertsContainer');
const resetPolygonBtn = document.getElementById('resetPolygonBtn');

// --- Paramètres de Simulation ---
const NUM_AIRCRAFT = 8; // Nombre d'avions simulés
const AIRCRAFT_SIZE = 8; // Taille des blips (pixels)
const AIRCRAFT_SPEED_MIN = 0.5; // px/frame
const AIRCRAFT_SPEED_MAX = 2.0; // px/frame
const RADAR_SWEEP_SPEED = 0.03; // Vitesse de la ligne de balayage du radar (radians/frame)
const MAX_ALERTS = 3; // Nombre max d'alertes affichées

let aircrafts = [];
let polygonPoints = [];
let radarSweepAngle = 0; // Angle du balayage radar
let animationFrameId; // Pour gérer la boucle d'animation

// --- Classe Aircraft (Avion) ---
class Aircraft {
    constructor(id, x, y, speed, heading) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.speed = speed; // Vitesse en pixels par frame
        this.heading = heading; // Cap en radians (0 = droite, PI/2 = bas, PI = gauche, 3PI/2 = haut)
        this.color = `hsl(${Math.random() * 360}, 100%, 70%)`; // Couleur aléatoire pour chaque avion
        this.isVisible = true; // Pour la logique d'apparition/disparition
    }

    update() {
        // Mettre à jour la position en fonction de la vitesse et du cap
        this.x += this.speed * Math.cos(this.heading);
        this.y += this.speed * Math.sin(this.heading);

        // Rebondir sur les bords du canvas
        if (this.x < 0 || this.x > canvas.width) {
            this.heading = Math.PI - this.heading; // Inverser la direction horizontale
            this.x = Math.max(0, Math.min(canvas.width, this.x)); // Assurer qu'il reste dans les limites
        }
        if (this.y < 0 || this.y > canvas.height) {
            this.heading = -this.heading; // Inverser la direction verticale
            this.y = Math.max(0, Math.min(canvas.height, this.y)); // Assurer qu'il reste dans les limites
        }

        // Ajouter une légère variation aléatoire au cap pour simuler des mouvements moins rectilignes
        this.heading += (Math.random() - 0.5) * 0.02; // Petite déviation aléatoire
    }

    draw() {
        if (!this.isVisible) return;

        ctx.beginPath();
        ctx.arc(this.x, this.y, AIRCRAFT_SIZE / 2, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0; // Réinitialiser l'ombre pour ne pas affecter le reste du dessin
    }

    // Calculer la vitesse en "noeuds" pour l'affichage (arbitraire)
    get displaySpeed() {
        // On peut définir une conversion arbitraire de px/frame en noeuds
        // Par exemple, 1 px/frame = 10 noeuds
        return (this.speed * 10).toFixed(1) + ' kts';
    }

    // Calculer le cap en degrés
    get displayHeading() {
        let degrees = (this.heading * 180 / Math.PI) % 360;
        if (degrees < 0) degrees += 360; // Assurer un angle positif
        return degrees.toFixed(0) + '°';
    }
}

// --- Fonctions de Dessin Radar ---

function drawRadarBackground() {
    // Fond du radar (dégradé pour l'effet)
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radarRadius);
    gradient.addColorStop(0, 'rgba(0, 255, 0, 0.05)');
    gradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 255, 0, 0.2)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cercle extérieur
    ctx.beginPath();
    ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#006600'; // Vert foncé pour la bordure
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cercles concentriques
    ctx.strokeStyle = '#004400';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radarRadius * (i / 4), 0, Math.PI * 2);
        ctx.stroke();
    }

    // Lignes de direction
    ctx.strokeStyle = '#004400';
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI / 6) * i;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + radarRadius * Math.cos(angle), centerY + radarRadius * Math.sin(angle));
        ctx.stroke();
    }
}

function drawRadarSweep() {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    const endX = centerX + radarRadius * Math.cos(radarSweepAngle);
    const endY = centerY + radarRadius * Math.sin(radarSweepAngle);

    // Créer un dégradé pour la ligne de balayage
    const sweepGradient = ctx.createLinearGradient(centerX, centerY, endX, endY);
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
// Source: https://stackoverflow.com/questions/22521982/check-if-point-is-inside-a-polygon-in-javascript
function isPointInPolygon(point, polygon) {
    // point = {x, y}
    // polygon = [{x, y}, {x, y}, ...]
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
        const speed = AIRCRAFT_SPEED_MIN + Math.random() * (AIRCRAFT_SPEED_MAX - AIRCRAFT_SPEED_MIN);
        const heading = Math.random() * Math.PI * 2; // Angle aléatoire en radians
        aircrafts.push(new Aircraft(`AC-${i + 1}`, x, y, speed, heading));
    }
}

// --- Boucle d'Animation ---
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Effacer le canvas

    drawRadarBackground();
    drawPolygon(); // Dessiner le polygone avant les avions

    let aircraftInPolygon = false; // Pour la gestion des alertes globales
    let displayedAircraft = null; // Pour afficher les infos du premier avion trouvé dans le polygone ou au centre

    // Mettre à jour et dessiner les avions
    aircrafts.forEach(aircraft => {
        aircraft.update();
        aircraft.draw();

        // Vérifier l'intrusion dans le polygone
        if (polygonPoints.length > 2 && isPointInPolygon({ x: aircraft.x, y: aircraft.y }, polygonPoints)) {
            addAlert(aircraft.id);
            aircraftInPolygon = true; // Un avion est dans le polygone
            // Si c'est le premier avion dans le polygone, afficher ses infos
            if (!displayedAircraft) {
                displayedAircraft = aircraft;
            }
        } else {
            removeAlert(aircraft.id); // L'avion est sorti, retirer l'alerte
        }

        // Si aucun avion n'est dans le polygone, afficher l'avion le plus proche du centre (simplement pour avoir une info par défaut)
        if (!displayedAircraft) {
             const dist = Math.sqrt(Math.pow(aircraft.x - centerX, 2) + Math.pow(aircraft.y - centerY, 2));
             if (dist < radarRadius / 4) { // Si l'avion est proche du centre du radar
                 if (!displayedAircraft || dist < Math.sqrt(Math.pow(displayedAircraft.x - centerX, 2) + Math.pow(displayedAircraft.y - centerY, 2))) {
                     displayedAircraft = aircraft;
                 }
             }
        }
    });

    // Afficher les informations de l'avion
    if (displayedAircraft) {
        aircraftIdSpan.textContent = displayedAircraft.id;
        aircraftSpeedSpan.textContent = displayedAircraft.displaySpeed;
        aircraftHeadingSpan.textContent = displayedAircraft.displayHeading;
    } else {
        aircraftIdSpan.textContent = 'N/A';
        aircraftSpeedSpan.textContent = 'N/A';
        aircraftHeadingSpan.textContent = 'N/A';
    }

    drawRadarSweep(); // Dessiner le balayage radar par-dessus les avions

    animationFrameId = requestAnimationFrame(animate); // Boucle
}

// --- Événements Utilisateur ---

// Gérer le clic pour ajouter des points au polygone
canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    polygonPoints.push({ x, y });
});

// Gérer le double-clic pour fermer le polygone
canvas.addEventListener('dblclick', () => {
    // Un double-clic après au moins 3 points ferme le polygone (dernier point = premier point)
    if (polygonPoints.length >= 3) {
        polygonPoints.push(polygonPoints[0]); // Ferme le polygone visuellement
    }
});

// Gérer la touche 'R' pour réinitialiser le polygone
document.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') {
        polygonPoints = [];
        // Effacer toutes les alertes actives
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

// --- Démarrage de la Simulation ---
initAircrafts();
animate(); // Lancer la boucle d'animation