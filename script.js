// City data storage
let cityCache = {};
let selectedCities = {
    origin: null,
    destination: null,
    start: null,
    stops: []
};

// Canadian postal code regex
const postalCodeRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

// Debounce function for API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if input is a postal code
function isPostalCode(input) {
    return postalCodeRegex.test(input.replace(/\s/g, ''));
}

// Geocode Canadian location using Nominatim API
async function geocodeCanadianLocation(query) {
    if (cityCache[query]) return cityCache[query];
    
    try {
        let searchQuery = query;
        if (isPostalCode(query)) {
            searchQuery = `${query}, Canada`;
        } else {
            searchQuery = `${query}, Canada`;
        }
        
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=ca&limit=8&addressdetails=1`);
        const data = await response.json();
        
        const locations = data.map(item => {
            const address = item.address || {};
            let displayName = item.display_name;
            
            // Format display name for Canadian locations
            if (address.city || address.town || address.village) {
                const city = address.city || address.town || address.village;
                const province = address.state || address.province;
                displayName = province ? `${city}, ${province}` : city;
            } else if (address.postcode) {
                displayName = `${address.postcode}, ${address.state || 'Canada'}`;
            }
            
            return {
                name: displayName,
                fullName: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                id: item.place_id,
                type: item.type,
                postcode: address.postcode
            };
        }).filter(item => item.lat && item.lng);
        
        cityCache[query] = locations;
        return locations;
    } catch (error) {
        console.error('Geocoding error:', error);
        return [];
    }
}

// Calculate distance using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
}

// Show location suggestions
function showSuggestions(inputId, suggestionsId, locations) {
    const suggestionsDiv = document.getElementById(suggestionsId);
    suggestionsDiv.innerHTML = '';
    
    if (locations.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }
    
    locations.forEach(location => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <div style="font-weight: 600;">${location.name}</div>
            <div style="font-size: 12px; color: #666;">${location.fullName}</div>
        `;
        item.onclick = () => selectCity(inputId, suggestionsId, location);
        suggestionsDiv.appendChild(item);
    });
    
    suggestionsDiv.style.display = 'block';
}

// Select city from suggestions
function selectCity(inputId, suggestionsId, location) {
    document.getElementById(inputId).value = location.name;
    document.getElementById(suggestionsId).style.display = 'none';
    
    // Store selected location data
    if (inputId === 'origin') selectedCities.origin = location;
    else if (inputId === 'destination') selectedCities.destination = location;
    else if (inputId === 'startLocation') selectedCities.start = location;
}

// Setup location input with suggestions
function setupLocationInput(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const debouncedSearch = debounce(async (query) => {
        if (query.length < 2) {
            document.getElementById(suggestionsId).style.display = 'none';
            return;
        }
        
        const locations = await geocodeCanadianLocation(query);
        showSuggestions(inputId, suggestionsId, locations);
    }, 300);
    
    input.addEventListener('input', (e) => {
        const value = e.target.value;
        // Clear selection when user types
        if (inputId === 'origin') selectedCities.origin = null;
        else if (inputId === 'destination') selectedCities.destination = null;
        else if (inputId === 'startLocation') selectedCities.start = null;
        
        debouncedSearch(value);
    });
    
    input.addEventListener('blur', () => {
        setTimeout(() => {
            document.getElementById(suggestionsId).style.display = 'none';
        }, 200);
    });
}

// Shipping rates per kilometer (Canadian rates)
const shippingRates = {
    standard: { baseCost: 18, perKm: 0.65, perPound: 0.15, days: [3, 5] },
    express: { baseCost: 42, perKm: 0.95, perPound: 0.22, days: [1, 2] },
    overnight: { baseCost: 85, perKm: 1.45, perPound: 0.40, days: [1, 1] }
};

// Calculate shipping cost
function calculateShippingCost(originLocation, destinationLocation, weight, shippingType) {
    const distance = calculateDistance(originLocation.lat, originLocation.lng, destinationLocation.lat, destinationLocation.lng);
    const rates = shippingRates[shippingType];
    
    const distanceCost = distance * rates.perKm;
    const weightCost = weight * rates.perPound;
    const totalCost = rates.baseCost + distanceCost + weightCost;
    
    return {
        cost: totalCost,
        distance: distance,
        deliveryDays: rates.days
    };
}

// Add stop to route
function addStop(location) {
    if (selectedCities.stops.find(stop => stop.id.toString() === location.id.toString())) return;
    
    selectedCities.stops.push(location);
    updateStopsList();
}

// Remove stop from route
function removeStop(locationId) {
    console.log('Removing stop with ID:', locationId);
    console.log('Current stops:', selectedCities.stops.map(s => s.id));
    selectedCities.stops = selectedCities.stops.filter(stop => stop.id.toString() !== locationId.toString());
    console.log('Stops after removal:', selectedCities.stops.map(s => s.id));
    updateStopsList();
}

// Update stops list display
function updateStopsList() {
    const stopsList = document.getElementById('stopsList');
    stopsList.innerHTML = '';
    
    selectedCities.stops.forEach(stop => {
        const item = document.createElement('div');
        item.className = 'stop-item';
        item.innerHTML = `
            <span>${stop.name}</span>
            <button class="remove-stop" data-id="${stop.id}">Remove</button>
        `;
        
        // Add event listener to the remove button
        const removeBtn = item.querySelector('.remove-stop');
        removeBtn.addEventListener('click', () => removeStop(stop.id));
        
        stopsList.appendChild(item);
    });
}

// Route optimization using nearest neighbor
function optimizeRoute(start, stops) {
    if (stops.length === 0) return { route: [start], totalDistance: 0 };
    
    const route = [start];
    const remaining = [...stops];
    let current = start;
    let totalDistance = 0;
    
    while (remaining.length > 0) {
        let nearest = remaining[0];
        let nearestDistance = calculateDistance(current.lat, current.lng, nearest.lat, nearest.lng);
        let nearestIndex = 0;
        
        for (let i = 1; i < remaining.length; i++) {
            const distance = calculateDistance(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
            if (distance < nearestDistance) {
                nearest = remaining[i];
                nearestDistance = distance;
                nearestIndex = i;
            }
        }
        
        route.push(nearest);
        totalDistance += nearestDistance;
        current = nearest;
        remaining.splice(nearestIndex, 1);
    }
    
    return { route, totalDistance };
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupLocationInput('origin', 'originSuggestions');
    setupLocationInput('destination', 'destinationSuggestions');
    setupLocationInput('startLocation', 'startSuggestions');
    
    // Stop input handler
    const stopInput = document.getElementById('stopInput');
    const debouncedStopSearch = debounce(async (query) => {
        if (query.length < 2) {
            document.getElementById('stopSuggestions').style.display = 'none';
            return;
        }
        
        const locations = await geocodeCanadianLocation(query);
        showSuggestions('stopInput', 'stopSuggestions', locations);
    }, 300);
    
    stopInput.addEventListener('input', (e) => debouncedStopSearch(e.target.value));
    stopInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const locations = await geocodeCanadianLocation(stopInput.value);
            if (locations.length > 0) {
                addStop(locations[0]);
                stopInput.value = '';
                document.getElementById('stopSuggestions').style.display = 'none';
            }
        }
    });
    
    // Override suggestion selection for stops
    window.selectCity = function(inputId, suggestionsId, location) {
        if (inputId === 'stopInput') {
            addStop(location);
            document.getElementById(inputId).value = '';
        } else {
            document.getElementById(inputId).value = location.name;
            if (inputId === 'origin') selectedCities.origin = location;
            else if (inputId === 'destination') selectedCities.destination = location;
            else if (inputId === 'startLocation') selectedCities.start = location;
        }
        document.getElementById(suggestionsId).style.display = 'none';
    };
    
    // removeStop is now handled by event listeners in updateStopsList
});

// Shipping form handler
document.getElementById('shippingForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const weight = parseFloat(document.getElementById('weight').value);
    const shippingType = document.getElementById('shippingType').value;
    
    if (!selectedCities.origin || !selectedCities.destination || !weight || !shippingType) {
        alert('Please select valid Canadian locations and fill in all fields');
        return;
    }
    
    if (selectedCities.origin.id === selectedCities.destination.id) {
        alert('Origin and destination cannot be the same');
        return;
    }
    
    const result = calculateShippingCost(selectedCities.origin, selectedCities.destination, weight, shippingType);
    
    document.getElementById('shippingCost').textContent = `$${result.cost.toFixed(2)} CAD`;
    document.getElementById('deliveryTime').textContent = 
        result.deliveryDays[0] === result.deliveryDays[1] 
            ? `${result.deliveryDays[0]} day${result.deliveryDays[0] > 1 ? 's' : ''}`
            : `${result.deliveryDays[0]}-${result.deliveryDays[1]} days`;
    document.getElementById('distance').textContent = `${result.distance} km`;
    
    document.getElementById('shippingResults').classList.remove('hidden');
});

// Route form handler
document.getElementById('routeForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!selectedCities.start) {
        alert('Please select a valid Canadian start location');
        return;
    }
    
    if (selectedCities.stops.length === 0) {
        alert('Please add at least one stop');
        return;
    }
    
    const optimization = optimizeRoute(selectedCities.start, selectedCities.stops);
    
    // Display route
    const routeOrderDiv = document.getElementById('routeOrder');
    routeOrderDiv.innerHTML = '';
    
    optimization.route.forEach((location, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'route-step';
        stepDiv.innerHTML = `
            <div class="step-number">${index + 1}</div>
            <div>${location.name}</div>
        `;
        routeOrderDiv.appendChild(stepDiv);
    });
    
    // Calculate costs
    const avgWeight = 50;
    let totalCost = 0;
    let totalTime = 0;
    
    for (let i = 0; i < optimization.route.length - 1; i++) {
        const segmentCost = calculateShippingCost(
            optimization.route[i], 
            optimization.route[i + 1], 
            avgWeight, 
            'standard'
        );
        totalCost += segmentCost.cost;
        totalTime = Math.max(totalTime, segmentCost.deliveryDays[1]);
    }
    
    document.getElementById('totalDistance').textContent = `${optimization.totalDistance} km`;
    document.getElementById('totalCost').textContent = `$${totalCost.toFixed(2)} CAD`;
    document.getElementById('totalTime').textContent = `${totalTime} days`;
    
    document.getElementById('routeResults').classList.remove('hidden');
});