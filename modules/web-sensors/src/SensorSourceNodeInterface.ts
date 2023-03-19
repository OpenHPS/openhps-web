import { SourceNode, DataFrame } from '@openhps/core';

export interface SensorSourceNodeInterface extends SourceNode<DataFrame> {
    start(): Promise<void>;

    stop(): Promise<void>;

    onPull(): Promise<DataFrame>;
}
