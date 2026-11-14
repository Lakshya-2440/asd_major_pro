export type Role = 'typer' | 'supervisor' | 'admin'

export const ROLE_LABELS: Record<Role, string> = {
  typer: 'Field Typer',
  supervisor: 'Supervisor',
  admin: 'Admin',
}

export interface User {
  id: string | number
  code?: string
  name: string
  email: string
  role: Role
}

export interface Session {
  token: string
  user: User
}

export const GUEST_USER: User = {
  id: 'guest-typer-001',
  code: 'TYPER-001',
  name: 'Field Typer (Guest)',
  email: 'guest@auto-atc.local',
  role: 'typer',
}

export const GUEST_SESSION: Session = {
  token: 'guest-token-typer-001',
  user: GUEST_USER,
}