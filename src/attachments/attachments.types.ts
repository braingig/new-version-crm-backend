export type AttachmentKind = 'task' | 'project';

export type AttachmentOwner = {
    kind: AttachmentKind;
    taskId?: string;
    projectId?: string;
    draftKey?: string;
};

