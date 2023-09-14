import { SensorSourceNode } from './web/SensorSourceNode';
import { SensorSourceNode as SensorSourceNodeLegacy } from './legacy/SensorSourceNode';

let implementation = SensorSourceNode;
if (!('Accelerometer' in window)) {
    implementation = SensorSourceNodeLegacy as any;
}
export { implementation as SensorSourceNode };
