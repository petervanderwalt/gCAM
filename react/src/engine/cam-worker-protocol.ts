export interface CamWorkerProgress {
    percent: number;
    label: string;
}

export interface SerializedCamLoop {
    id?: string;
    points: { x: number; y: number }[];
    isBitmap?: boolean;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface SerializedCamToolpath {
    id: string;
    label: string;
    operation: string;
    previewContours: { x: number; y: number }[][];
    motionPaths: {
        safeToClose: boolean;
        points: { x: number; y: number; z: number }[];
    }[];
    tabs: {
        contourIndex: number;
        along: number;
        point?: { x: number; y: number } | null;
    }[];
    [key: string]: unknown;
}

export interface BuildToolpathRequest {
    id: number;
    type: 'build-toolpath';
    selectedLoops: SerializedCamLoop[];
    config: Record<string, unknown>;
    toolpathOptions: Record<string, unknown>;
}

export interface BuildGcodeRequest {
    id: number;
    type: 'build-gcode';
    toolpaths: SerializedCamToolpath[];
    fileName: string;
    forcePolylineArcs: boolean;
}

export interface CancelCamRequest {
    id: number;
    type: 'cancel';
    targetId: number;
}

export type CamWorkerRequest =
    | BuildToolpathRequest
    | BuildGcodeRequest
    | CancelCamRequest;

export interface CamWorkerProgressMessage {
    id: number;
    progress: CamWorkerProgress;
}

export interface CamWorkerResultMessage {
    id: number;
    result: unknown;
}

export interface CamWorkerErrorMessage {
    id: number;
    error: string;
    stack: string | null;
}

export type CamWorkerMessage =
    | CamWorkerProgressMessage
    | CamWorkerResultMessage
    | CamWorkerErrorMessage;

export function isWorkerProgress(
    message: CamWorkerMessage,
): message is CamWorkerProgressMessage {
    return 'progress' in message;
}

export function isWorkerError(
    message: CamWorkerMessage,
): message is CamWorkerErrorMessage {
    return 'error' in message;
}
