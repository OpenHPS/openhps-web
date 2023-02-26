import { ProcessingNode, ProcessingNodeOptions } from '@openhps/core';
import { XRDataFrame } from '../../data';
import { WebXRService } from '../../service';

export class XRHitTest<In extends XRDataFrame, Out extends XRDataFrame> extends ProcessingNode<In, Out> {
    private _service: WebXRService = null;
    private _viewerSpace: XRReferenceSpace;
    private _hitSource: XRHitTestSource;

    constructor(options?: ProcessingNodeOptions) {
        super(options);

        this.once('build', this._onBuild.bind(this));
        this.once('destroy', this._onDestroy.bind(this));
    }

    private _onBuild(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._service = this.model.findService<WebXRService>(WebXRService);
            if (this._service === undefined || this._service === null) {
                return reject(new Error(`WebXR service was not added to model!`));
            }

            this._service.session
                .requestReferenceSpace('viewer')
                .then((refSpace) => {
                    this._viewerSpace = refSpace;
                    return this._service.session.requestHitTestSource({ space: this._viewerSpace });
                })
                .then((hitTestSource) => {
                    this._hitSource = hitTestSource;
                    resolve();
                })
                .catch(reject);
        });
    }

    private _onDestroy(): Promise<void> {
        return new Promise((resolve) => {
            this._hitSource.cancel();
            this._hitSource = null;
            resolve();
        });
    }

    process(data: In): Promise<Out> {
        return new Promise((resolve) => {
            const frame = data.rawFrame;

            if (this._hitSource && data.viewerPose) {
                const hitTestResults = frame.getHitTestResults(this._hitSource);
                if (hitTestResults.length > 0) {
                    const targetPose = hitTestResults[0].getPose(data.refSpace);
                    data.targetPose = targetPose.transform.matrix;
                }
            }
            resolve(data as unknown as Out);
        });
    }
}
