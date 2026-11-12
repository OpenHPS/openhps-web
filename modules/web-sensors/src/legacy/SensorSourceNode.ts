import {
    Acceleration,
    AngularVelocity,
    DataFrame,
    Orientation,
    SensorSourceOptions,
    SourceNode,
    AbsoluteOrientationSensor as AbsoluteOrientationSensorObject,
    Gyroscope as GyroscopeObject,
    Accelerometer as AccelerometerObject,
    DataObject,
    AccelerationUnit,
    AngularVelocityUnit,
} from '@openhps/core';
import { SensorSourceNodeInterface } from '../SensorSourceNodeInterface';

/**
 * IMU source using the HTML5 browser API for device motion and device orientation.
 * @category Source node
 */
export class SensorSourceNode extends SourceNode<DataFrame> implements SensorSourceNodeInterface {
    protected options: SensorSourceOptions;
    private _running = false;
    private _onDeviceMotion: (event: DeviceMotionEvent) => void;
    private _onDeviceOrientation: (event: DeviceOrientationEvent) => void;

    constructor(options?: SensorSourceOptions) {
        super(options);
        this.options.source = this.options.source ?? new DataObject(this.uid);
        if (this.options.autoStart) {
            this.once('build', this.start.bind(this));
        }
        this.once('destroy', this.stop.bind(this));
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static requestPermissions(...args: any[]): Promise<void> {
        if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
            return (DeviceMotionEvent as any).requestPermission().then((response: string) => {
                if (response !== 'granted') {
                    return Promise.reject(new Error('Permission to access device motion was denied.'));
                }
            });
        }
        return Promise.resolve();
    }

    start(): Promise<void> {
        return new Promise((resolve) => {
            this._running = true;
            this._onDeviceMotion = (event) => {
                if (!this._running) {
                    return;
                }
                const sensorUID = this.source ? this.source.uid : this.uid;
                // Create a new data frame for the orientation change
                const dataFrame = new DataFrame();
                const frequency = 1000 / event.interval;
                dataFrame.addSensor(
                    new AccelerometerObject(
                        sensorUID + '_accl',
                        new Acceleration(
                            event.accelerationIncludingGravity.x,
                            event.accelerationIncludingGravity.y,
                            event.accelerationIncludingGravity.z,
                            AccelerationUnit.METER_PER_SECOND_SQUARE,
                        ),
                        frequency,
                    ),
                );
                dataFrame.addSensor(
                    new GyroscopeObject(
                        sensorUID + '_gyro',
                        new AngularVelocity(
                            event.rotationRate.beta,
                            event.rotationRate.gamma,
                            event.rotationRate.alpha,
                            AngularVelocityUnit.RADIAN_PER_SECOND,
                        ),
                        frequency,
                    ),
                );
                dataFrame.addSensor(
                    new AccelerometerObject(
                        sensorUID + '_linearaccl',
                        new Acceleration(
                            event.acceleration.x,
                            event.acceleration.y,
                            event.acceleration.z,
                            AccelerationUnit.METER_PER_SECOND_SQUARE,
                        ),
                        frequency,
                    ),
                );

                const source = this.source;
                source.getPosition().angularVelocity = dataFrame.getSensor(GyroscopeObject).value;
                dataFrame.addSensor(
                    new AbsoluteOrientationSensorObject(sensorUID + '_orientation', source.getPosition().orientation),
                );
                dataFrame.source = source;

                this.push(dataFrame);
            };

            this._onDeviceOrientation = (event) => {
                const source = this.source;
                source.getPosition().orientation = Orientation.fromEuler([event.beta, event.gamma, event.alpha]);
            };

            window.addEventListener('devicemotion', this._onDeviceMotion, true);
            window.addEventListener('deviceorientation', this._onDeviceOrientation);

            this.logger('debug', 'Browser orientation and motion events registered!');
            resolve();
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            this._running = false;
            if (this._onDeviceMotion) {
                window.removeEventListener('devicemotion', this._onDeviceMotion, true);
                this._onDeviceMotion = undefined;
            }
            if (this._onDeviceOrientation) {
                window.removeEventListener('deviceorientation', this._onDeviceOrientation);
                this._onDeviceOrientation = undefined;
            }
            resolve();
        });
    }

    public onPull(): Promise<DataFrame> {
        return new Promise<DataFrame>((resolve) => {
            resolve(undefined);
        });
    }
}
