import { MemberField, MemberIdentity, MemberSubIdentity } from '@chihhaocooly/chihhao-package';

export interface SurveyReference {
  surveyKey: string;
  title: string;
  isEnabled: boolean;
}
export interface IdentityChild extends MemberSubIdentity {
  references: { memberCount: number; surveys: SurveyReference[] };
  richmenu: { richmenuKey: string; name: string; imageUrl: string } | null;
  syncSummary: Record<string, number>;
}
export interface IdentityGroup extends MemberIdentity {
  children: IdentityChild[];
}
export interface IdentityGroupResponse {
  item: IdentityGroup;
  revision: string;
}
export interface IdentityGroupInput {
  expectedRevision: string | null;
  name: string;
  isEnabled: boolean;
  children: { id: string; name: string; isEnabled: boolean; richmenuKey: string | null }[];
  deletedSubIdentityIds: string[];
}
export interface FieldEditingInfo {
  canChangeType: boolean;
  canDelete: boolean;
  canDisable: boolean;
  valueCount: number;
  surveys: SurveyReference[];
  options: { id: string; canRemove: boolean; reason: 'member-values' | 'survey-binding' | null }[];
}
export type EditableMemberField = MemberField & { editing: FieldEditingInfo };
