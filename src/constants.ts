'use strict';

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const TYPE_IHDR = 0x49484452;
export const TYPE_IEND = 0x49454e44;
export const TYPE_IDAT = 0x49444154;
export const TYPE_PLTE = 0x504c5445;
export const TYPE_tRNS = 0x74524e53;
export const TYPE_gAMA = 0x67414d41;

export const COLOR_PALETTE = 1;
export const COLOR_COLOR = 2;
export const COLOR_ALPHA = 4;
