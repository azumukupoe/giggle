export interface Event {
    id: string
    external_id?: string
    title: string
    artist: string
    venue: string
    location: string
    date: string
    url: string
    image_url?: string
    source: 'bandsintown' | 'songkick' | 'seatgeek' | 'ticketmaster' | 'seated' | 'resident_advisor' | 'other'
}
