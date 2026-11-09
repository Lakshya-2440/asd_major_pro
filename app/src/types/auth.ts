export type Role = 'typer' | 'supervisor' | 'admin'

export const ROLE_LABELS: Record<Role, string> = {
  typer: 'Field Typer',
  supervisor: 'Supervisor',
  admin: 'Admin',
}

export interface User {
  id: string | number
  name: string
  email: string
  role: Role
}

export interface Session {
  token: string
  user: User
}