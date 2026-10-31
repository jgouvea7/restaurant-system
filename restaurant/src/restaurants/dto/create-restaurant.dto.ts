
export class CreateRestaurantDto {
    name!: string;
    slug!: string;
    description!: string;
    phone!: string;
    ownerUserId!: string;
    restaurantAddress!: {
        street: string;
        number: string;
        city: string;
        state: string;
        postalCode: string;
    }

}
