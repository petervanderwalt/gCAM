import type { ComponentProps } from 'react';
import { EditorWorkspace } from './EditorWorkspace';

/** Typed composition boundary between the application controller and editor UI. */
export interface AppWorkspaceModel {
    editor: ComponentProps<typeof EditorWorkspace>;
}

export function AppWorkspace({ model }: { model: AppWorkspaceModel }) {
    return <EditorWorkspace {...model.editor} />;
}
