import { PushOptions, SinkNode, SinkNodeOptions } from '@openhps/core';
import { XRDataFrame } from '../../data';
import { WebXRService } from '../../service';

export class XRSink<In extends XRDataFrame> extends SinkNode<In> {
    private _service: WebXRService = null;

    constructor(options?: SinkNodeOptions) {
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
            resolve();
        });
    }

    private _onDestroy(): Promise<void> {
        return new Promise((resolve) => {
            resolve();
        });
    }

    onPush(data: In, options?: PushOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            const gl = this._service.gl;
            const session = this._service.session;
            gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
            resolve();
        });
    }
}
