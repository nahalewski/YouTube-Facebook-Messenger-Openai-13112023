const axios = require('axios');
const cheerio = require('cheerio');

// Updated URLs for the dealership's inventory pages
const BASE_URL = 'https://www.johnsoncitynissan.com';
const NEW_INVENTORY_URL = `${BASE_URL}/new-vehicles/`;
const USED_INVENTORY_URL = `${BASE_URL}/used-vehicles/`;
const CPO_INVENTORY_URL = `${BASE_URL}/certified-pre-owned/`;

// Vehicle models and their common variations
const VEHICLE_MODELS = {
    'altima': ['altima', 'nissan altima'],
    'maxima': ['maxima', 'nissan maxima'],
    'rogue': ['rogue', 'nissan rogue', 'rogue sport'],
    'murano': ['murano', 'nissan murano'],
    'pathfinder': ['pathfinder', 'nissan pathfinder'],
    'frontier': ['frontier', 'nissan frontier'],
    'titan': ['titan', 'nissan titan'],
    'sentra': ['sentra', 'nissan sentra'],
    'versa': ['versa', 'nissan versa'],
    'kicks': ['kicks', 'nissan kicks'],
    'armada': ['armada', 'nissan armada']
};

const searchInventory = async (query) => {
    try {
        // Determine inventory type
        const queryLower = query.toLowerCase();
        const isUsed = queryLower.includes('used') || queryLower.includes('pre-owned');
        const isCPO = queryLower.includes('certified');
        
        // Determine which model is being searched for
        const requestedModel = Object.entries(VEHICLE_MODELS)
            .find(([model, variations]) => 
                variations.some(variation => queryLower.includes(variation))
            );

        // Build search parameters
        const searchParams = new URLSearchParams({
            model: requestedModel ? requestedModel[0] : '',
            condition: isUsed ? 'used' : isCPO ? 'certified' : 'new'
        });

        // Determine which inventory URL to use
        const inventoryUrl = isCPO ? CPO_INVENTORY_URL :
                           isUsed ? USED_INVENTORY_URL :
                           NEW_INVENTORY_URL;

        // Make the request with custom headers to mimic a browser
        const response = await axios.get(`${inventoryUrl}?${searchParams.toString()}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const vehicles = [];

        // Find all vehicle listings using multiple possible selectors
        const vehicleSelectors = [
            '.vehicle-card', // Common selector for vehicle cards
            '.inventory-item',
            '.vehicle-listing',
            '[data-vehicle]', // Data attribute selector
            '.vehicle-details'
        ];

        // Try each selector until we find vehicles
        for (const selector of vehicleSelectors) {
            $(selector).each((index, element) => {
                try {
                    // Extract basic vehicle information
                    const $el = $(element);
                    
                    // Try multiple possible selectors for each piece of information
                    const title = extractText($el, [
                        '.vehicle-title', 
                        '.inventory-title',
                        'h2',
                        '[data-vehicle-title]'
                    ]);

                    const price = extractText($el, [
                        '.price',
                        '.vehicle-price',
                        '[data-price]',
                        '.price-value'
                    ]);

                    const mileage = extractText($el, [
                        '.mileage',
                        '.vehicle-mileage',
                        '[data-mileage]',
                        '.odometer'
                    ]);

                    const vin = extractText($el, [
                        '.vin',
                        '.vehicle-vin',
                        '[data-vin]'
                    ]);

                    // Extract additional details
                    const details = {
                        exterior: extractText($el, ['.exterior-color', '[data-exterior-color]']),
                        interior: extractText($el, ['.interior-color', '[data-interior-color]']),
                        transmission: extractText($el, ['.transmission', '[data-transmission]']),
                        drivetrain: extractText($el, ['.drivetrain', '[data-drivetrain]']),
                        engine: extractText($el, ['.engine', '[data-engine]']),
                        fuelEconomy: extractText($el, ['.fuel-economy', '[data-mpg]'])
                    };

                    // Extract media
                    const images = [];
                    $el.find('img').each((i, img) => {
                        const src = $(img).attr('src') || $(img).attr('data-src');
                        if (src && !src.includes('placeholder') && !images.includes(src)) {
                            images.push(src.startsWith('//') ? `https:${src}` : src);
                        }
                    });

                    // Extract vehicle URL
                    const detailUrl = $el.find('a').filter((i, a) => {
                        const href = $(a).attr('href');
                        return href && (href.includes('/vehicle/') || href.includes('/inventory/'));
                    }).first().attr('href');

                    // Only add if we have at least a title or VIN
                    if (title || vin) {
                        vehicles.push({
                            title: title || 'Vehicle Details Not Available',
                            price: price || 'Contact Dealer for Price',
                            mileage: mileage || 'Not Specified',
                            vin: vin || 'Contact Dealer for VIN',
                            details,
                            images,
                            detailUrl: detailUrl ? 
                                (detailUrl.startsWith('http') ? detailUrl : `${BASE_URL}${detailUrl}`) : 
                                null
                        });
                    }
                } catch (err) {
                    console.error('Error parsing vehicle listing:', err);
                }
            });

            // If we found vehicles with this selector, break the loop
            if (vehicles.length > 0) break;
        }

        // If no vehicles found, try to fetch from alternative pages
        if (vehicles.length === 0 && !isUsed && !isCPO) {
            // Try CPO inventory as fallback
            const cpoResults = await searchInventory(`certified ${query}`);
            if (cpoResults && !cpoResults.includes('apologize')) {
                return cpoResults;
            }
        }

        return formatSearchResults(vehicles, isUsed, isCPO);
    } catch (error) {
        console.error('Error searching inventory:', error);
        return `I apologize, but I'm having trouble accessing the inventory system right now. Please try again in a moment or contact Johnson City Nissan directly at (423) 282-2221 for the most up-to-date inventory information.`;
    }
};

// Helper function to extract text using multiple possible selectors
const extractText = ($el, selectors) => {
    for (const selector of selectors) {
        const text = $el.find(selector).first().text().trim();
        if (text) return text;
    }
    return '';
};

const formatSearchResults = (vehicles, isUsed, isCPO) => {
    if (vehicles.length === 0) {
        return formatNoResultsResponse(isUsed, isCPO);
    }

    const inventoryType = isCPO ? 'Certified Pre-Owned' : 
                         isUsed ? 'Pre-Owned' : 'New';
    
    let response = `Here are the ${inventoryType} vehicles I found:\n\n`;

    vehicles.forEach((vehicle, index) => {
        response += `${index + 1}. ${vehicle.title}\n`;
        if (vehicle.price) response += `   Price: ${vehicle.price}\n`;
        if (vehicle.mileage && (isUsed || isCPO)) response += `   Mileage: ${vehicle.mileage}\n`;
        if (vehicle.vin) response += `   VIN: ${vehicle.vin}\n`;
        
        // Add relevant details if available
        const details = Object.entries(vehicle.details)
            .filter(([_, value]) => value)
            .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
        
        if (details.length > 0) {
            response += `   Specifications:\n`;
            details.forEach(detail => response += `   - ${detail}\n`);
        }

        if (vehicle.detailUrl) response += `   More details: ${vehicle.detailUrl}\n`;
        response += '\n';
    });

    response += `\nWould you like to:\n`;
    response += `1. Schedule a test drive for any of these vehicles?\n`;
    response += `2. Get more specific information about any vehicle?\n`;
    response += `3. See different vehicles?\n\n`;
    response += `You can also call Johnson City Nissan at (423) 282-2221 for immediate assistance.`;

    return response;
};

const formatNoResultsResponse = (isUsed, isCPO) => {
    const inventoryType = isCPO ? 'Certified Pre-Owned' : 
                         isUsed ? 'pre-owned' : 'new';
    
    let response = `I apologize, but I couldn't find any ${inventoryType} vehicles matching your search criteria.\n\n`;
    response += `Would you like to:\n`;
    response += `1. Search our ${isUsed ? 'new' : 'pre-owned'} inventory instead?\n`;
    response += `2. Broaden your search criteria?\n`;
    response += `3. Be notified when matching vehicles become available?\n\n`;
    response += `You can also call Johnson City Nissan at (423) 282-2221 to speak with our team about your specific requirements.`;
    return response;
};

module.exports = {
    searchInventory,
    formatSearchResults,
    formatNoResultsResponse
};
