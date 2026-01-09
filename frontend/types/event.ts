export type LocalizedText = { en: string; ja: string };

export interface Event {
    id: string
    event: string[]
    performer: string[]
    venue: LocalizedText
    location: LocalizedText[]
    date: string[]
    time: string | null
    ticket: string[] | null
    url: string
    image: string[] | null
}

export interface GroupedEvent {
    id: string           // Primary event's id
    event: string[]
    performer: string[]
    venue: LocalizedText
    location: LocalizedText[]
    date: string[]
    time: string | null
    urls: string[]       // All ticket URLs for this event
    sourceEvents: Event[] // The original events that form this group
    displayDates: string[] // List of ISO strings to display for merged events
}
