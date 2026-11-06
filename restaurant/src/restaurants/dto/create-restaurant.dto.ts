
export class CreateRestaurantDto {
    name!: string;
    slug!: string;
    description!: string;
    phone!: string;
    restaurantAddress!: {
        street: string;
        number: string;
        city: string;
        state: string;
        postalCode: string;
    }

}
