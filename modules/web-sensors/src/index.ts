import { SensorSourceNode } from './web/SensorSourceNode';
import { SensorSourceNode as SensorSourceNodeLegacy } from './legacy/SensorSourceNode';

let implementation = SensorSourceNode;
if (typeof window === 'undefined' || !('Accelerometer' in window)) {
    implementation = SensorSourceNodeLegacy as any;
}
export { implementation as SensorSourceNode };
