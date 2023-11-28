import { SerializableObject, SerializableMember } from '@openhps/core';
import { CameraObject, DepthVideoFrame } from '@openhps/video';

@SerializableObject()
export class XRDataFrame extends DepthVideoFrame<XRCPUDepthInformation, Uint8Array, CameraObject> {
    /**
     * Reference space
     */
    refSpace: XRReferenceSpace;
    @SerializableMember()
    viewerPose: Float32Array;
    /**
     * Raw XR Frame
     */
    rawFrame: XRFrame;
    @SerializableMember()
    targetPose: Float32Array;
    /**
     * WebGLTexture of the image
     */
    texture: WebGLTexture;
}
