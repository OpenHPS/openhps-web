/// <reference types="web" />

import {
    SourceNode,
    SensorSourceOptions,
    Acceleration,
    Orientation,
    Quaternion,
    DataFrame,
    SensorObject,
    LinearAccelerationSensor as LinearAccelerationSensorObject,
    AbsoluteOrientationSensor as AbsoluteOrientationSensorObject,
    RelativeOrientationSensor as RelativeOrientationSensorObject,
    Magnetometer as MagnetometerObject,
    Gyroscope as GyroscopeObject,
    Accelerometer as AccelerometerObject,
    AngularVelocity,
    AngularVelocityUnit,
    Magnetism,
    SensorType,
} from '@openhps/core';
import { SensorSourceNodeInterface } from '../SensorSourceNodeInterface';

/**
 * Sensor source node using Web Sensor API.
 */
export class SensorSourceNode extends SourceNode<DataFrame> implements SensorSourceNodeInterface {
    protected options: SensorSourceOptions;
    private _subscriptions: Map<SensorType, Sensor> = new Map();
    private _values: Map<SensorType, any> = new Map();
    private _lastPush = 0;
    private _running = false;

    constructor(options?: SensorSourceOptions) {
        super(options);
        this.options.interval = this.options.interval || 100;
        if (this.options.autoStart) {
            this.once('build', this.start.bind(this));
        }
        this.once('destroy', this.stop.bind(this));
    }

    static checkPermissions(sensors: SensorType[]): Promise<boolean> {
        return this.requestPermissions(sensors);
    }

    static requestPermissions(sensors: SensorType[]): Promise<boolean> {
        return new Promise((resolve, reject) => {
            Promise.all(
                sensors
                    .map((sensor) =>
                        this.getPermissions(sensor).map((permission) =>
                            navigator.permissions.query({ name: permission as PermissionName }),
                        ),
                    )
                    .reduce((a, b) => [...a, ...b]),
            )
                .then((results) => {
                    if (results.every((result) => result.state === 'granted')) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                })
                .catch(reject);
        });
    }

    requestPermissions(): Promise<boolean> {
        return SensorSourceNode.requestPermissions(this.options.sensors);
    }

    start(): Promise<void> {
        return new Promise<void>((resolve) => {
            this._running = true;
            if (this._subscriptions.size > 0) {
                return resolve();
            }

            this.options.sensors.forEach((sensor) => {
                const SensorType = this.findSensor(sensor);
                if (SensorType === undefined) {
                    // Not supported
                    return;
                }
                const sensorInstance = new SensorType({
                    frequency: Math.round(1000 / this.options.interval),
                });
                sensorInstance.addEventListener('reading', (event) => {
                    if (!this._running) return;
                    this._values.set(sensor, event.target);
                    if (this._isUpdated()) {
                        this._lastPush = event.timeStamp;
                        this.createFrame().catch((ex) => {
                            this.logger('error', 'Unable to create sensor data frame!', ex);
                        });
                    }
                });
                sensorInstance.start();
                this._subscriptions.set(sensor, sensorInstance);
            });
            resolve();
        });
    }

    private _isUpdated(): boolean {
        return (
            Array.from(this._values.values()).filter((sensor) => sensor.timestamp > this._lastPush).length ===
            Array.from(this._subscriptions.values()).filter((sensor) => sensor.activated).length
        );
    }

    stop(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.options.softStop) {
                this._running = false;
            } else {
                this._subscriptions.forEach((value) => value.stop());
                this._subscriptions = new Map();
                this._values = new Map();
            }
            resolve();
        });
    }

    protected createFrame(): Promise<void> {
        return new Promise<void>((resolve) => {
            const dataFrame = new DataFrame();
            dataFrame.source = this.source;

            const acceleration: Accelerometer = this._values.get(AccelerometerObject);
            const linearAcceleration: LinearAccelerationSensor = this._values.get(LinearAccelerationSensorObject);
            const gyroscope: Gyroscope = this._values.get(GyroscopeObject);
            const orientation: AbsoluteOrientationSensor = this._values.get(AbsoluteOrientationSensorObject);
            const relativeOrientation: RelativeOrientationSensor = this._values.get(RelativeOrientationSensorObject);
            const magnetometer: Magnetometer = this._values.get(MagnetometerObject);

            const sourceUID = this.source ? this.source.uid : this.uid;
            const frequency = 1000 / this.options.interval;

            if (acceleration) {
                dataFrame.addSensor(
                    new AccelerometerObject(
                        sourceUID + '_accel',
                        new Acceleration(acceleration.x, acceleration.y, acceleration.z),
                        frequency,
                    ),
                );
            }
            if (linearAcceleration) {
                dataFrame.addSensor(
                    new LinearAccelerationSensorObject(
                        sourceUID + '_linearaccel',
                        new Acceleration(linearAcceleration.x, linearAcceleration.y, linearAcceleration.z),
                        frequency,
                    ),
                );
            }
            if (gyroscope) {
                dataFrame.addSensor(
                    new GyroscopeObject(
                        sourceUID + '_gyro',
                        new AngularVelocity(
                            gyroscope.x,
                            gyroscope.y,
                            gyroscope.z,
                            AngularVelocityUnit.RADIAN_PER_SECOND,
                        ),
                        frequency,
                    ),
                );
            }
            if (orientation) {
                dataFrame.addSensor(
                    new AbsoluteOrientationSensorObject(
                        sourceUID + '_absoluteorientation',
                        Orientation.fromQuaternion(new Quaternion(...orientation.quaternion)),
                        frequency,
                    ),
                );
            }
            if (relativeOrientation) {
                dataFrame.addSensor(
                    new RelativeOrientationSensorObject(
                        sourceUID + '_relativeorientation',
                        Orientation.fromQuaternion(new Quaternion(...relativeOrientation.quaternion)),
                        frequency,
                    ),
                );
            }
            if (magnetometer) {
                dataFrame.addSensor(
                    new MagnetometerObject(
                        sourceUID + '_mag',
                        new Magnetism(magnetometer.x, magnetometer.y, magnetometer.z),
                        frequency,
                    ),
                );
            }

            this.push(dataFrame);
            resolve();
        });
    }

    public onPull(): Promise<DataFrame> {
        return new Promise<DataFrame>((resolve) => {
            resolve(undefined);
        });
    }

    protected findSensor(sensor: SensorType): new (options?: SensorOptions) => Sensor {
        switch (sensor) {
            case RelativeOrientationSensorObject:
                return RelativeOrientationSensor;
            case AbsoluteOrientationSensorObject:
                return AbsoluteOrientationSensor;
            case LinearAccelerationSensorObject:
                return LinearAccelerationSensor;
            // case SensorType.AMBIENT_LIGHT:
            //     return AmbientLightSensor;
            case GyroscopeObject:
                return Gyroscope;
            case MagnetometerObject:
                return (window as any).Magnetometer; // Experimental
            case AccelerometerObject:
                return Accelerometer;
            default:
                return undefined;
        }
    }

    protected static getPermissions(sensor: new () => SensorObject): string[] {
        switch (sensor) {
            // case SensorType.AMBIENT_LIGHT:
            //     return ["ambient-light-sensor"];
            case RelativeOrientationSensorObject:
            case AbsoluteOrientationSensorObject:
                return ['gyroscope', 'accelerometer', 'magnetometer'];
            case GyroscopeObject:
                return ['gyroscope'];
            case MagnetometerObject:
                return ['magnetometer'];
            case LinearAccelerationSensorObject:
            case AccelerometerObject:
                return ['accelerometer'];
            default:
                return undefined;
        }
    }
}
