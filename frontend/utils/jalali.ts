import { PlateNumber } from '../types';

export const formatJalali = (date: Date): string => {
    return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
};

export const formatJalaliDateTime = (date: Date): string => {
     return new Intl.DateTimeFormat('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export const formatPlateNumber = (plate?: PlateNumber): string => {
    if (!plate) return '';
    // Prepending a Left-to-Right Mark (LRM) to ensure the browser renders
    // the mixed-direction string in the correct visual order.
    // The desired order is: part1 letter part2 - cityCode.
    return `\u200E${plate.part1} ${plate.letter} ${plate.part2} - ${plate.cityCode}`;
};