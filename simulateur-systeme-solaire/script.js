document.addEventListener('DOMContentLoaded', () => {
    const solarSystemContainer = document.querySelector('.solar-system-container');
    const starsContainer = document.querySelector('.stars-container');
    const togglePauseBtn = document.getElementById('toggle-pause');
    const toggleReverseBtn = document.getElementById('toggle-reverse');
    const toggleDescriptionBtn = document.getElementById('toggle-description');
    const descriptionArea = document.getElementById('description-area');
    const trackPlanetSelect = document.getElementById('track-planet');

    const planets = document.querySelectorAll('.planet');
    const sun = document.querySelector('.sun');
    const earth = document.querySelector('.planet.earth');
    const moon = document.querySelector('.moon'); // Lune de la Terre (notre satellite naturel de référence)

    // NOUVEAU : Références aux satellites artificiels
    const satellite1 = document.querySelector('.satellite.satellite-1');
    const satellite2 = document.querySelector('.satellite.satellite-2');

    const jupiter = document.querySelector('.planet.jupiter');
    const ganymede = document.querySelector('.moon.ganymede');
    const saturn = document.querySelector('.planet.saturn');
    const titan = document.querySelector('.moon.titan');

    const orbits = document.querySelectorAll('.orbit');

    // NOUVEAU : Référence mise à jour pour le laser Terre-Planète (ID ajusté)
    const laserEarthToPlanet = document.getElementById('laser-earth-to-planet');
    const laserSatelliteToPlanet = document.getElementById('laser-satellite-to-planet');

    let isPaused = false;
    let isReversed = false;
    let trackedPlanet = null;

    // --- Génération des étoiles ---
    const numStars = 500;
    const createStar = () => {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 2}s`;
        starsContainer.appendChild(star);
    };

    for (let i = 0; i < numStars; i++) {
        createStar();
    }

    // --- Fonctionnalité Pause/Reprendre ---
    const togglePause = () => {
        isPaused = !isPaused;
        const playState = isPaused ? 'paused' : 'running';

        orbits.forEach(orbit => {
            orbit.style.animationPlayState = playState;
        });

        const stars = document.querySelectorAll('.star');
        stars.forEach(star => {
             star.style.animationPlayState = playState;
        });

        togglePauseBtn.textContent = isPaused ? 'Reprendre' : 'Pause';
    };

    togglePauseBtn.addEventListener('click', togglePause);

    // --- Fonctionnalité Inverser le temps ---
    const toggleReverse = () => {
        isReversed = !isReversed;
        const direction = isReversed ? 'reverse' : 'normal';

        orbits.forEach(orbit => {
            orbit.style.animationDirection = direction;
        });

        toggleReverseBtn.textContent = isReversed ? 'Remettre à l\'endroit' : 'Inverser le temps';
    };

    toggleReverseBtn.addEventListener('click', toggleReverse);

    // --- Fonctionnalité Afficher/Masquer Description ---
    toggleDescriptionBtn.addEventListener('click', () => {
        descriptionArea.classList.toggle('hidden');
        if (descriptionArea.classList.contains('hidden')) {
            toggleDescriptionBtn.textContent = 'Afficher la description';
        } else {
            toggleDescriptionBtn.textContent = 'Masquer la description';
        }
    });

    // Fonction pour obtenir la position absolue (par rapport au document) d'un élément
    function getAbsoluteCenter(element) {
        if (!element) return { x: 0, y: 0 };
        const rect = element.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    // Fonction pour mettre à jour la position et la rotation du laser
    function drawLaser(laserElement, startElement, endElement) {
        if (!laserElement || !startElement || !endElement) {
            if (laserElement) laserElement.style.display = 'none';
            return;
        }

        const start = getAbsoluteCenter(startElement);
        const end = getAbsoluteCenter(endElement);

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        laserElement.style.left = `${start.x}px`;
        laserElement.style.top = `${start.y}px`;
        laserElement.style.width = `${distance}px`;
        laserElement.style.transform = `rotate(${angle}deg)`;
        laserElement.style.display = 'block';
    }

    // --- Fonctionnalité Suivi de Planète avec Lasers ---
    trackPlanetSelect.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value === 'none') {
            trackedPlanet = null;
            laserEarthToPlanet.style.display = 'none';
            laserSatelliteToPlanet.style.display = 'none';
        } else {
            switch(value) {
                case 'mercury': trackedPlanet = document.querySelector('.planet.mercury'); break;
                case 'venus':   trackedPlanet = document.querySelector('.planet.venus'); break;
                case 'earth':   trackedPlanet = document.querySelector('.planet.earth'); break;
                case 'mars':    trackedPlanet = document.querySelector('.planet.mars'); break;
                case 'jupiter': trackedPlanet = document.querySelector('.planet.jupiter'); break;
                case 'saturn':  trackedPlanet = document.querySelector('.planet.saturn'); break;
                default: trackedPlanet = null;
            }
        }
    });

    // Mettre à jour les lasers à chaque frame d'animation
    function animateLasers() {
        if (trackedPlanet) {
            // Laser 1: De la Terre vers la planète suivie
            drawLaser(laserEarthToPlanet, earth, trackedPlanet);

            // Laser 2: Du Satellite (Lune) vers la planète suivie
            // Si vous voulez que ce laser parte d'un satellite artificiel vers la planète suivie,
            // vous devriez modifier 'moon' ici par 'satellite1' ou 'satellite2'.
            drawLaser(laserSatelliteToPlanet, moon, trackedPlanet); 

        } else {
            laserEarthToPlanet.style.display = 'none';
            laserSatelliteToPlanet.style.display = 'none';
        }
        requestAnimationFrame(animateLasers);
    }
    animateLasers(); // Lancer la boucle d'animation des lasers
});