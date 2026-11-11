import type * as React from 'react';

export type Hue = 1 | 2 | 3;
export type Brand = 'auto' | 'psizone' | 'eqsync' | 'hemisync';

export interface LogoProps { size?: number; brand?: Brand; variant?: 'lockup' | 'mark'; href?: string; className?: string }
export declare function Logo(props: LogoProps): React.ReactElement;

export interface AmbientFieldProps { intensity?: 'low' | 'medium' | 'high'; style?: React.CSSProperties; className?: string; children?: React.ReactNode }
export declare function AmbientField(props: AmbientFieldProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'glass' | 'ghost'; size?: 'sm' | 'md' | 'lg'; arrow?: boolean; href?: string }
export declare function Button(props: ButtonProps): React.ReactElement;

export interface GlassCardProps extends React.HTMLAttributes<HTMLElement> { solid?: boolean; as?: keyof JSX.IntrinsicElements }
export declare function GlassCard(props: GlassCardProps): React.ReactElement;

export interface ChipProps { tone?: 'accent' | 'ai' | 'warm' | 'neutral'; selected?: boolean; onClick?: () => void; className?: string; children?: React.ReactNode }
export declare function Chip(props: ChipProps): React.ReactElement;

export interface StatusBadgeProps { tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; className?: string; children?: React.ReactNode }
export declare function StatusBadge(props: StatusBadgeProps): React.ReactElement;

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; hint?: string; error?: string }
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface AskBarProps { onSubmit?: (text: string) => void; placeholder?: string; label?: string; suggestions?: string[]; defaultValue?: string; className?: string }
export declare function AskBar(props: AskBarProps): React.ReactElement;

export interface GuideSource { label: string; href?: string }
export interface GuideMessageProps { role?: 'guide' | 'user'; sources?: GuideSource[]; className?: string; children?: React.ReactNode }
export declare function GuideMessage(props: GuideMessageProps): React.ReactElement;

export interface HubCardProps { title: string; href?: string; eyebrow?: string; text?: string; tags?: string[]; hue?: Hue; className?: string }
export declare function HubCard(props: HubCardProps): React.ReactElement;

export interface ProgressSignalProps { label?: string; delta?: string; startLabel?: string; endLabel?: string; caption?: string; startNoise?: number; endNoise?: number; className?: string }
export declare function ProgressSignal(props: ProgressSignalProps): React.ReactElement;

export interface ArticleCardProps { title: string; href?: string; image?: string; topic?: string; excerpt?: string; author?: string; minutes?: number; reviewed?: string; className?: string }
export declare function ArticleCard(props: ArticleCardProps): React.ReactElement;

export interface ProseProps { className?: string; children?: React.ReactNode }
export declare function Prose(props: ProseProps): React.ReactElement;

export interface AudioPlayerProps { title: string; src?: string; duration?: number; meta?: string; progress?: number; className?: string }
export declare function AudioPlayer(props: AudioPlayerProps): React.ReactElement;

export interface ProgramTrackerProps { total?: number; done?: number; title?: string; note?: string; className?: string }
export declare function ProgramTracker(props: ProgramTrackerProps): React.ReactElement;

export interface ProductCardProps { title: string; price: string; kind?: string; text?: string; image?: string; badge?: string; action?: string; secondary?: boolean; className?: string }
export declare function ProductCard(props: ProductCardProps): React.ReactElement;

export interface NavLink { label: string; href?: string; current?: boolean }
export interface NavBarProps { links?: NavLink[]; actions?: React.ReactNode; homeHref?: string; className?: string }
export declare function NavBar(props: NavBarProps): React.ReactElement;

export interface PractitionerCardProps { name: string; role?: string; photo?: string; specialties?: string[]; action?: React.ReactNode; className?: string }
export declare function PractitionerCard(props: PractitionerCardProps): React.ReactElement;

declare global { interface Window { Psizone: {
  Logo: typeof Logo; AmbientField: typeof AmbientField; Button: typeof Button; GlassCard: typeof GlassCard; Chip: typeof Chip;
  StatusBadge: typeof StatusBadge; TextField: typeof TextField; AskBar: typeof AskBar; GuideMessage: typeof GuideMessage;
  HubCard: typeof HubCard; ProgressSignal: typeof ProgressSignal; NavBar: typeof NavBar; PractitionerCard: typeof PractitionerCard; ArticleCard: typeof ArticleCard; Prose: typeof Prose; AudioPlayer: typeof AudioPlayer; ProgramTracker: typeof ProgramTracker; ProductCard: typeof ProductCard;
} } }
