import "@testing-library/jest-dom";
import "fake-indexeddb/auto";

// Mock canvas 2d context for jsdom
HTMLCanvasElement.prototype.getContext = function (this: any, contextId: string) {
    if (contextId === "2d") {
        return {
            scale: () => {},
            clearRect: () => {},
            fillRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            closePath: () => {},
            arc: () => {},
            fill: () => {},
            measureText: () => ({ width: 0 }),
            canvas: this,
            strokeStyle: "#000",
            lineWidth: 1,
            lineCap: "round",
            lineJoin: "round",
        } as any;
    }
    return null;
} as any;

// Mock ResizeObserver for jsdom
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
