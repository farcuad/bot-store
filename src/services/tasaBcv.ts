import axios from 'axios';

export const getTasaBCV = async (): Promise<string> => {
    try {
        const response = await axios.get('https://u2.rsgve.com/gym-api/api/bcv-rate');
        return parseFloat(response.data.rate).toFixed(2);
    } catch (error) {
        return "45.00"; 
    }
}