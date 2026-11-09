"use client";

import { CheckIcon, FolderSimpleIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/modal";
import type { HabitGroup } from "@/lib/habits";

export function HabitGroupManager({ code, identityId, groups, habitCounts, onGroupsChange, onGroupDeleted, onClose }: {
  code: string;
  identityId: string;
  groups: HabitGroup[];
  habitCounts: Record<string, number>;
  onGroupsChange: (groups: HabitGroup[]) => void;
  onGroupDeleted: (groupId: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const request = async (method: "POST" | "PUT" | "DELETE", body: Record<string, string>) => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/events/${code}/habit-groups`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identityId, ...body }),
      });
      const payload = await response.json() as { group?: HabitGroup; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "保存分组失败");
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存分组失败");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const payload = await request("POST", { name: newName });
    if (!payload?.group) return;
    onGroupsChange([...groups, payload.group]);
    setNewName("");
  };

  const rename = async (group: HabitGroup) => {
    if (!editingName.trim()) return;
    const payload = await request("PUT", { groupId: group.id, name: editingName });
    if (!payload?.group) return;
    onGroupsChange(groups.map((item) => item.id === group.id ? payload.group! : item));
    setEditingId(null);
  };

  const remove = async (group: HabitGroup) => {
    const payload = await request("DELETE", { groupId: group.id });
    if (!payload) return;
    onGroupsChange(groups.filter((item) => item.id !== group.id));
    onGroupDeleted(group.id);
    setConfirmDeleteId(null);
  };

  return <Modal title="管理习惯分组" onClose={saving ? () => undefined : onClose}>
    <div className="space-y-5">
      <p className="text-sm leading-6 text-slate-500">分组由所有成员共用。删除分组后，里面的习惯会回到“未分组”。</p>
      <form className="flex gap-2" onSubmit={create}>
        <input className="text-input min-w-0 flex-1" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={40} placeholder="例如 学习、健康" autoFocus />
        <button type="submit" className="primary-button shrink-0 px-4" disabled={saving || !newName.trim()}><PlusIcon size={16} weight="bold" />新建</button>
      </form>

      {groups.length ? <div className="space-y-2">{groups.map((group) => <div key={group.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
        {editingId === group.id ? <div className="flex items-center gap-2">
          <input className="text-input min-w-0 flex-1 bg-white" value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={40} aria-label={`修改${group.name}分组名称`} />
          <button type="button" className="icon-button shrink-0 text-blue-600" disabled={saving || !editingName.trim()} onClick={() => void rename(group)} aria-label="保存分组名称"><CheckIcon size={16} weight="bold" /></button>
          <button type="button" className="icon-button shrink-0" disabled={saving} onClick={() => setEditingId(null)} aria-label="取消修改"><XIcon size={16} weight="bold" /></button>
        </div> : <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-blue-500 ring-1 ring-slate-100"><FolderSimpleIcon size={16} weight="fill" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{group.name}</span><span className="block text-xs text-slate-400">{habitCounts[group.id] ?? 0} 个习惯</span></span>
          <button type="button" className="icon-button size-8 shrink-0" disabled={saving} onClick={() => { setEditingId(group.id); setEditingName(group.name); setConfirmDeleteId(null); }} aria-label={`修改${group.name}`}><PencilSimpleIcon size={14} weight="bold" /></button>
          <button type="button" className="icon-button size-8 shrink-0 text-slate-400 hover:text-red-600" disabled={saving} onClick={() => { setConfirmDeleteId(group.id); setEditingId(null); }} aria-label={`删除${group.name}`}><TrashIcon size={14} weight="bold" /></button>
        </div>}
        {confirmDeleteId === group.id ? <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2"><p className="text-xs leading-5 text-red-700">删除分组，不删除其中习惯。</p><div className="flex shrink-0 gap-1.5"><button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white" disabled={saving} onClick={() => setConfirmDeleteId(null)}>取消</button><button type="button" className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700" disabled={saving} onClick={() => void remove(group)}>{saving ? "删除中" : "确认"}</button></div></div> : null}
      </div>)}</div> : <div className="rounded-xl bg-slate-50 px-4 py-6 text-center"><FolderSimpleIcon size={22} weight="duotone" className="mx-auto text-slate-300" /><p className="mt-2 text-sm text-slate-500">还没有分组</p><p className="mt-1 text-xs text-slate-400">先创建一个，再到习惯编辑中选择。</p></div>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  </Modal>;
}
