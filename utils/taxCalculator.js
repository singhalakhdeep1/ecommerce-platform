/**
 * CURRICULUM COVERAGE:
 * #1826-1850: Business logic - Tax calculation
 * #640-675: Complex calculations and business rules
 */

class TaxCalculator {
    // US State Tax Rates (simplified - in production, use API like Avalara/Vertex)
    static STATE_TAX_RATES = {
        'AL': 0.04, 'AK': 0.00, 'AZ': 0.056, 'AR': 0.065, 'CA': 0.0725,
        'CO': 0.029, 'CT': 0.0635, 'DE': 0.00, 'FL': 0.06, 'GA': 0.04,
        'HI': 0.04, 'ID': 0.06, 'IL': 0.0625, 'IN': 0.07, 'IA': 0.06,
        'KS': 0.065, 'KY': 0.06, 'LA': 0.0445, 'ME': 0.055, 'MD': 0.06,
        'MA': 0.0625, 'MI': 0.06, 'MN': 0.06875, 'MS': 0.07, 'MO': 0.04225,
        'MT': 0.00, 'NE': 0.055, 'NV': 0.0685, 'NH': 0.00, 'NJ': 0.06625,
        'NM': 0.05125, 'NY': 0.04, 'NC': 0.0475, 'ND': 0.05, 'OH': 0.0575,
        'OK': 0.045, 'OR': 0.00, 'PA': 0.06, 'RI': 0.07, 'SC': 0.06,
        'SD': 0.045, 'TN': 0.07, 'TX': 0.0625, 'UT': 0.0595, 'VT': 0.06,
        'VA': 0.053, 'WA': 0.065, 'WV': 0.06, 'WI': 0.05, 'WY': 0.04,
        'DC': 0.06
    };

    // International Tax Rates (simplified)
    static COUNTRY_TAX_RATES = {
        'CA': 0.05, // Canada - GST
        'GB': 0.20, // UK - VAT
        'DE': 0.19, // Germany - VAT
        'FR': 0.20, // France - VAT
        'AU': 0.10, // Australia - GST
        'JP': 0.10, // Japan - Consumption Tax
        'IN': 0.18, // India - GST
        'BR': 0.17, // Brazil - ICMS
        'MX': 0.16, // Mexico - IVA
        'IT': 0.22, // Italy - VAT
        'ES': 0.21, // Spain - VAT
        'NL': 0.21, // Netherlands - VAT
        'BE': 0.21, // Belgium - VAT
        'AT': 0.20, // Austria - VAT
        'SE': 0.25, // Sweden - VAT
        'NO': 0.25, // Norway - VAT
        'DK': 0.25, // Denmark - VAT
        'FI': 0.24, // Finland - VAT
        'CH': 0.077, // Switzerland - VAT
        'IE': 0.23, // Ireland - VAT
        'PT': 0.23, // Portugal - VAT
        'GR': 0.24, // Greece - VAT
        'PL': 0.23, // Poland - VAT
        'CZ': 0.21, // Czech Republic - VAT
        'HU': 0.27, // Hungary - VAT
        'RO': 0.19, // Romania - VAT
        'BG': 0.20, // Bulgaria - VAT
        'HR': 0.25, // Croatia - VAT
        'SI': 0.22, // Slovenia - VAT
        'SK': 0.20, // Slovakia - VAT
        'EE': 0.20, // Estonia - VAT
        'LV': 0.21, // Latvia - VAT
        'LT': 0.21, // Lithuania - VAT
        'LU': 0.17, // Luxembourg - VAT
        'CY': 0.19, // Cyprus - VAT
        'MT': 0.18, // Malta - VAT
        'ZA': 0.15, // South Africa - VAT
        'SG': 0.07, // Singapore - GST
        'MY': 0.06, // Malaysia - SST
        'TH': 0.07, // Thailand - VAT
        'VN': 0.10, // Vietnam - VAT
        'ID': 0.11, // Indonesia - VAT
        'PH': 0.12, // Philippines - VAT
        'KR': 0.10, // South Korea - VAT
        'CN': 0.13, // China - VAT
        'HK': 0.00, // Hong Kong - No VAT
        'TW': 0.05, // Taiwan - VAT
        'NZ': 0.15, // New Zealand - GST
        'AR': 0.21, // Argentina - VAT
        'CL': 0.19, // Chile - VAT
        'CO': 0.19, // Colombia - VAT
        'PE': 0.18, // Peru - IGV
        'VE': 0.16, // Venezuela - IVA
        'EC': 0.12, // Ecuador - IVA
        'BO': 0.13, // Bolivia - IVA
        'PY': 0.10, // Paraguay - IVA
        'UY': 0.22, // Uruguay - IVA
        'CR': 0.13, // Costa Rica - IVA
        'PA': 0.07, // Panama - ITBMS
        'DO': 0.18, // Dominican Republic - ITBIS
        'JM': 0.15, // Jamaica - GCT
        'TT': 0.125, // Trinidad and Tobago - VAT
        'BB': 0.175, // Barbados - VAT
        'BS': 0.075, // Bahamas - VAT
        'GD': 0.10, // Grenada - VAT
        'LC': 0.15, // Saint Lucia - VAT
        'AG': 0.15, // Antigua and Barbuda - ABST
        'DM': 0.15, // Dominica - VAT
        'VC': 0.15, // Saint Vincent and the Grenadines - VAT
        'KN': 0.17, // Saint Kitts and Nevis - VAT
        'TT': 0.125, // Trinidad and Tobago - VAT
        'GY': 0.14, // Guyana - VAT
        'SR': 0.10, // Suriname - VAT
        'BZ': 0.125, // Belize - GST
        'HT': 0.10, // Haiti - TCA
        'CU': 0.00, // Cuba - No VAT
        'PR': 0.105, // Puerto Rico - IVU
        'VI': 0.00, // US Virgin Islands - No VAT
        'GU': 0.00, // Guam - No VAT
        'AS': 0.00, // American Samoa - No VAT
        'MP': 0.00, // Northern Mariana Islands - No VAT
        'FM': 0.00, // Federated States of Micronesia - No VAT
        'MH': 0.00, // Marshall Islands - No VAT
        'PW': 0.00, // Palau - No VAT
        'MH': 0.00, // Marshall Islands - No VAT
        'PW': 0.00, // Palau - No VAT
        'MH': 0.00, // Marshall Islands - No VAT
        'PW': 0.00, // Palau - No VAT
        'AE': 0.05, // United Arab Emirates - VAT
        'SA': 0.15, // Saudi Arabia - VAT
        'QA': 0.05, // Qatar - VAT
        'KW': 0.05, // Kuwait - VAT
        'BH': 0.05, // Bahrain - VAT
        'OM': 0.05, // Oman - VAT
        'JO': 0.16, // Jordan - VAT
        'LB': 0.11, // Lebanon - VAT
        'EG': 0.14, // Egypt - VAT
        'MA': 0.20, // Morocco - VAT
        'DZ': 0.19, // Algeria - VAT
        'TN': 0.19, // Tunisia - VAT
        'LY': 0.00, // Libya - No VAT
        'SD': 0.17, // Sudan - VAT
        'ET': 0.15, // Ethiopia - VAT
        'KE': 0.16, // Kenya - VAT
        'UG': 0.18, // Uganda - VAT
        'TZ': 0.18, // Tanzania - VAT
        'RW': 0.18, // Rwanda - VAT
        'BI': 0.18, // Burundi - VAT
        'MW': 0.165, // Malawi - VAT
        'ZM': 0.16, // Zambia - VAT
        'ZW': 0.15, // Zimbabwe - VAT
        'NA': 0.15, // Namibia - VAT
        'BW': 0.12, // Botswana - VAT
        'SZ': 0.15, // Eswatini - VAT
        'LS': 0.14, // Lesotho - VAT
        'AO': 0.14, // Angola - VAT
        'MZ': 0.17, // Mozambique - VAT
        'MG': 0.20, // Madagascar - VAT
        'MU': 0.15, // Mauritius - VAT
        'SC': 0.15, // Seychelles - VAT
        'CV': 0.15, // Cape Verde - VAT
        'ST': 0.15, // Sao Tome and Principe - VAT
        'GN': 0.18, // Guinea - VAT
        'GW': 0.15, // Guinea-Bissau - VAT
        'SN': 0.18, // Senegal - VAT
        'ML': 0.18, // Mali - VAT
        'BF': 0.18, // Burkina Faso - VAT
        'NE': 0.19, // Niger - VAT
        'TD': 0.18, // Chad - VAT
        'CF': 0.19, // Central African Republic - VAT
        'CM': 0.1925, // Cameroon - VAT
        'GA': 0.18, // Gabon - VAT
        'CG': 0.18, // Republic of the Congo - VAT
        'CD': 0.18, // Democratic Republic of the Congo - VAT
        'CI': 0.18, // Ivory Coast - VAT
        'GH': 0.125, // Ghana - VAT
        'NG': 0.075, // Nigeria - VAT
        'LR': 0.10, // Liberia - VAT
        'SL': 0.15, // Sierra Leone - GST
        'GN': 0.18, // Guinea - VAT
        'GW': 0.15, // Guinea-Bissau - VAT
        'SN': 0.18, // Senegal - VAT
        'GM': 0.15, // Gambia - VAT
        'MR': 0.16, // Mauritania - VAT
        'EH': 0.20, // Western Sahara - VAT
        'SO': 0.00, // Somalia - No VAT
        'DJ': 0.10, // Djibouti - VAT
        'ER': 0.00, // Eritrea - No VAT
        'SS': 0.17, // South Sudan - VAT
        'NG': 0.075, // Nigeria - VAT
        'TD': 0.18, // Chad - VAT
        'CF': 0.19, // Central African Republic - VAT
        'CM': 0.1925, // Cameroon - VAT
        'GA': 0.18, // Gabon - VAT
        'CG': 0.18, // Republic of the Congo - VAT
        'CD': 0.18, // Democratic Republic of the Congo - VAT
        'AO': 0.14, // Angola - VAT
        'NA': 0.15, // Namibia - VAT
        'BW': 0.12, // Botswana - VAT
        'SZ': 0.15, // Eswatini - VAT
        'LS': 0.14, // Lesotho - VAT
        'MW': 0.165, // Malawi - VAT
        'ZM': 0.16, // Zambia - VAT
        'ZW': 0.15, // Zimbabwe - VAT
        'MZ': 0.17, // Mozambique - VAT
        'MG': 0.20, // Madagascar - VAT
        'MU': 0.15, // Mauritius - VAT
        'SC': 0.15, // Seychelles - VAT
        'CV': 0.15, // Cape Verde - VAT
        'ST': 0.15, // Sao Tome and Principe - VAT
        'GQ': 0.15, // Equatorial Guinea - VAT
        'BJ': 0.18, // Benin - VAT
        'TG': 0.18, // Togo - VAT
        'BJ': 0.18, // Benin - VAT
        'TG': 0.18, // Togo - VAT
    };

    /**
     * Calculate tax based on shipping address
     * @param {number} subtotal - Order subtotal
     * @param {object} shippingAddress - Shipping address object
     * @param {string} shippingAddress.country - Country code (ISO 3166-1 alpha-2)
     * @param {string} shippingAddress.state - State/Province code
     * @param {string} shippingAddress.zip - Postal code
     * @returns {object} Tax calculation result
     */
    static calculateTax(subtotal, shippingAddress) {
        if (!shippingAddress || !shippingAddress.country) {
            return {
                taxRate: 0,
                taxAmount: 0,
                taxType: 'none',
                jurisdiction: 'Unknown'
            };
        }

        const country = shippingAddress.country.toUpperCase();
        const state = shippingAddress.state?.toUpperCase();
        let taxRate = 0;
        let taxType = 'none';
        let jurisdiction = country;

        // Check if country has tax
        if (country === 'US' && state) {
            // US state tax
            taxRate = this.STATE_TAX_RATES[state] || 0;
            taxType = 'state';
            jurisdiction = `US-${state}`;
        } else if (this.COUNTRY_TAX_RATES[country]) {
            // International tax
            taxRate = this.COUNTRY_TAX_RATES[country];
            taxType = 'vat';
            jurisdiction = country;
        }

        // Calculate tax amount
        const taxAmount = subtotal * taxRate;

        return {
            taxRate: taxRate * 100, // Convert to percentage
            taxAmount: Math.round(taxAmount * 100) / 100, // Round to 2 decimal places
            taxType,
            jurisdiction,
            isTaxExempt: taxRate === 0
        };
    }

    /**
     * Calculate tax for multiple line items
     * @param {Array} items - Array of cart items
     * @param {object} shippingAddress - Shipping address
     * @returns {object} Detailed tax breakdown
     */
    static calculateLineItemTax(items, shippingAddress) {
        const baseTaxInfo = this.calculateTax(
            items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            shippingAddress
        );

        const lineItems = items.map(item => {
            const itemTax = (item.price * item.quantity) * (baseTaxInfo.taxRate / 100);
            return {
                productId: item.productId,
                productName: item.name,
                quantity: item.quantity,
                price: item.price,
                subtotal: item.price * item.quantity,
                taxRate: baseTaxInfo.taxRate,
                taxAmount: Math.round(itemTax * 100) / 100
            };
        });

        const totalTax = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);

        return {
            ...baseTaxInfo,
            lineItems,
            totalTax: Math.round(totalTax * 100) / 100
        };
    }

    /**
     * Check if address is tax-exempt
     * @param {object} shippingAddress - Shipping address
     * @returns {boolean}
     */
    static isTaxExempt(shippingAddress) {
        if (!shippingAddress || !shippingAddress.country) return false;

        const country = shippingAddress.country.toUpperCase();
        const state = shippingAddress.state?.toUpperCase();

        // Check tax-exempt jurisdictions
        const taxExemptStates = ['AK', 'DE', 'MT', 'NH', 'OR'];
        const taxExemptCountries = ['HK', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM'];

        if (country === 'US' && taxExemptStates.includes(state)) {
            return true;
        }

        if (taxExemptCountries.includes(country)) {
            return true;
        }

        return false;
    }

    /**
     * Get tax rate for a jurisdiction
     * @param {string} country - Country code
     * @param {string} state - State code (optional)
     * @returns {number} Tax rate as percentage
     */
    static getTaxRate(country, state = null) {
        country = country?.toUpperCase();
        state = state?.toUpperCase();

        if (country === 'US' && state) {
            return (this.STATE_TAX_RATES[state] || 0) * 100;
        }

        return (this.COUNTRY_TAX_RATES[country] || 0) * 100;
    }
}

module.exports = TaxCalculator;
