/// <reference types="web" />

import {
    SourceNode,
    SensorSourceOptions,
    Acceleration,
    Orientation,
    TimeService,
    Quaternion,
    DataFrame,
    SensorObject,
    LinearAccelerationSensor as LinearAccelerationSensorObject,
    AbsoluteOrientationSensor as AbsoluteOrientationSensorObject,
    RelativeOrientationSensor as RelativeOrientationSensorObject,
    Magnetometer as MagnetometerObject,
    Gyroscope as GyroscopeObject,
    Accelerometer as AccelerometerObject,
} from '@openhps/core';

/**
 * Sensor source node using react-native-sensors.
 */
export class SensorSourceNode extends SourceNode<DataFrame> {
    protected options: IMUSourceNodeOptions;
    private _subscriptions: Map<new () => SensorObject, Sensor> = new Map();
    private _values: Map<new () => SensorObject, any> = new Map();
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
        return new Promise((resolve, reject) => {
            Promise.all(this.options.sensors.map(sensor => 
                this.getPermissions(sensor).map(permission => 
                    navigator.permissions.query({ name: permission as PermissionName }))).reduce((a, b) => [...a, ...b]))
            .then(results => {
                if (results.every((result) => result.state === "granted")) {
                    resolve();
                } else {
                    reject(new Error(`No permission to use the required sensors!`));
                }
            }).catch(reject);
        });
    }

    start(): Promise<void> {
        return new Promise<void>((resolve) => {
            this._running = true;
            if (this._subscriptions.size > 0) {
                return resolve();
            }

            this.options.sensors.forEach((sensor) => {
                const SensorType = this.findSensor(sensor);
                const sensorInstance = new SensorType({
                    frequency: Math.round(1000 / this.options.interval)
                });
                sensorInstance.addEventListener("reading", (value) => {
                    if (!this._running) return;
                    this._values.set(sensor, value);
                    if (this._isUpdated()) {
                        this._lastPush = TimeService.now();
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
            this.options.sensors.length
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

    public createFrame(): Promise<void> {
        return new Promise<void>((resolve) => {
            const dataFrame = new DataFrame();
            dataFrame.source = this.source;

            const acceleration: Accelerometer = this._values.get(AccelerometerObject);
            const gyroscope: Gyroscope = this._values.get(GyroscopeObject);
            const orientation: AbsoluteOrientationSensor = this._values.get(AbsoluteOrientationSensorObject);

            if (acceleration) {
                dataFrame.addSensor(new AccelerometerObject(this.uid + "_accel", new Acceleration(
                    acceleration.x,
                    acceleration.y,
                    acceleration.z,
                ), 1000 / this.options.interval));
            }
            if (gyroscope) {
                dataFrame.addSensor(new GyroscopeObject(this.uid + "_gyro", new Acceleration(
                    gyroscope.x,
                    gyroscope.y,
                    gyroscope.z
                ), 1000 / this.options.interval));
            }
            if (orientation) {
                dataFrame.addSensor(new AbsoluteOrientationSensorObject(this.uid + "_absoluteorientation",
                    Orientation.fromQuaternion(new Quaternion(...orientation.quaternion)), 
                    1000 / this.options.interval));
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

    protected findSensor(sensor: new () => SensorObject): new (options?: SensorOptions) => Sensor {
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
                return Magnetometer;
            case AccelerometerObject:
                return Accelerometer;
            default:
                return undefined;
        }
    }

    protected getPermissions(sensor: new () => SensorObject): string[] {
        switch (sensor) {
            // case SensorType.AMBIENT_LIGHT:
            //     return ["ambient-light-sensor"];
            case RelativeOrientationSensorObject:
            case AbsoluteOrientationSensorObject:
                return ["gyroscope", "accelerometer", "magnetometer"];
            case GyroscopeObject:
                return ["gyroscope"];
            case MagnetometerObject:
                return ["magnetometer"];
            case LinearAccelerationSensorObject:
            case AccelerometerObject:
                return ["accelerometer"];
            default:
                return undefined;
        }
    }
}

export interface IMUSourceNodeOptions extends SensorSourceOptions {
    sensors: (new () => SensorObject)[];
    softStop?: boolean;
}
