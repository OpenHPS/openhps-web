/// <reference types="web" />

import {
    SourceNode,
    SensorSourceOptions,
    Acceleration,
    Orientation,
    AngularVelocity,
    TimeService,
} from '@openhps/core';
import { IMUDataFrame } from '@openhps/imu';

/**
 * IMU source node using react-native-sensors.
 */
export class IMUSourceNode extends SourceNode<IMUDataFrame> {
    protected options: IMUSourceNodeOptions;
    private _subscriptions: Map<SensorType, PluginListenerHandle> = new Map();
    private _values: Map<SensorType, any> = new Map();
    private _lastPush = 0;
    private _running = false;

    constructor(options?: IMUSourceNodeOptions) {
        super(options);
        this.options.interval = this.options.interval || 50;
        if (this.options.autoStart) {
            this.once('build', this.start.bind(this));
        }
        this.once('destroy', this.stop.bind(this));
    }

    requestPermission(): Promise<void> {
        return new Promise((resolve, reject) => {});
    }

    start(): Promise<void> {
        return new Promise<void>((resolve) => {
            this._running = true;
            if (this._subscriptions.size > 0) {
                return resolve();
            }

            this.options.sensors.forEach((sensor) => {
                const sensorEvent = this.findSensorEvent(sensor);
                const handler = Motion.addListener(sensorEvent as any, (value) => {
                    if (!this._running) return;
                    this._values.set(sensor, value);
                    if (this._isUpdated()) {
                        this._lastPush = TimeService.now();
                        this.createFrame().catch((ex) => {
                            this.logger('error', 'Unable to create IMU data frame!', ex);
                        });
                    }
                });
                this._subscriptions.set(sensor, handler);
            });
            resolve();
        });
    }

    private _isUpdated(): boolean {
        return (
            Array.from(this._values.values()).filter((sensor) => sensor.timestamp > this._lastPush).length ===
            this.options.sensors.length
        );
    }

    stop(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.options.softStop) {
                this._running = false;
            } else {
                this._subscriptions.forEach((value) => value.remove());
                this._subscriptions = new Map();
                this._values = new Map();
                Motion.removeAllListeners();
            }
            resolve();
        });
    }

    public createFrame(): Promise<void> {
        return new Promise<void>((resolve) => {
            const dataFrame = new IMUDataFrame();
            dataFrame.source = this.source;

            const acceleration: AccelListenerEvent = this._values.get(SensorType.ACCELEROMETER);
            const orientation: OrientationListenerEvent = this._values.get(SensorType.ORIENTATION);

            if (acceleration) {
                dataFrame.acceleration = new Acceleration(
                    acceleration.acceleration.x,
                    acceleration.acceleration.y,
                    acceleration.acceleration.z,
                );
                dataFrame.angularVelocity = new AngularVelocity(
                    acceleration.rotationRate.beta,
                    acceleration.rotationRate.alpha,
                    acceleration.rotationRate.gamma,
                );
            }
            if (orientation) {
                dataFrame.absoluteOrientation = Orientation.fromEuler({
                    x: orientation.beta,
                    y: orientation.alpha,
                    z: orientation.gamma,
                });
            }

            dataFrame.frequency = 1000 / this.options.interval;

            this.push(dataFrame);
            resolve();
        });
    }

    public onPull(): Promise<IMUDataFrame> {
        return new Promise<IMUDataFrame>((resolve) => {
            resolve(undefined);
        });
    }

    protected findSensorInstance(sensor: SensorType): any {
        switch (sensor) {
            case SensorType.ORIENTATION:
                return AbsoluteOrientationSensor;
            case SensorType.GYROSCOPE:
                return Gyroscope;
            case SensorType.MAGNETOMETER:
                return Magnetometer;
            case SensorType.ACCELEROMETER:
                return Accelerometer;
            default:
                return undefined;
        }
    }
}

export interface IMUSourceNodeOptions extends SensorSourceOptions {
    sensors: SensorType[];
    softStop?: boolean;
}

export enum SensorType {
    ACCELEROMETER,
    GYROSCOPE,
    MAGNETOMETER,
    ORIENTATION,
}
