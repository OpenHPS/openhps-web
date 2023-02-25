import { SensorSourceNode } from './web/SensorSourceNode';
import { SensorSourceNode as SensorSourceNodeLegacy } from './legacy/SensorSourceNode';

module.exports = 'Accelerometer' in window ? { SensorSourceNode } : { SensorSourceNode: SensorSourceNodeLegacy };
