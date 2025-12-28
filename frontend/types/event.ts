export interface Event {
    id: string
    title: string
    artist: string
    venue: string
    location: string
    date: string
    url: string
}

export interface GroupedEvent {
    id: string           // Primary event's id
    title: string
    artist: string
    venue: string
    location: string
    date: string
    urls: string[]       // All ticket URLs for this event
}
