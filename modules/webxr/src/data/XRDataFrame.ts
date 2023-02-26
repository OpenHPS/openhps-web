import { SerializableObject, SerializableMember } from '@openhps/core';
import { CameraObject, DepthVideoFrame } from '@openhps/video';

@SerializableObject()
export class XRDataFrame extends DepthVideoFrame<XRCPUDepthInformation, CameraObject> {
    /**
     * Reference space
     */
    refSpace: XRReferenceSpace;
    @SerializableMember()
    viewerPose: Float32Array;
    rawFrame: XRFrame;
    @SerializableMember()
    targetPose: Float32Array;
}
