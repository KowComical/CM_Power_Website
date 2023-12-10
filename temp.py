import pandas as pd
import os


def transform_data(df, selected_energy, selected_continents):
    df['value'] = df['value'] / 1000  # Gwh to Twh
    df['date'] = pd.to_datetime(df['date'])

    ytd_sum_res = df.groupby('country').apply(current_year_sum)
    lytd_sum_res = df.groupby('country').apply(last_year_ytd_sum)
    percentage_change_res = ((ytd_sum_res - lytd_sum_res) / lytd_sum_res) * 100

    results = [{'country': country,
                'max_date': max(df[df['country'] == country]['date']),
                'total_value': sum(df[df['country'] == country]['value']),
                'row_count': len(df[df['country'] == country])}
               for country in df['country'].unique()]

    df = pd.DataFrame(results)
    df['year_to_date_sum'] = df['country'].map(ytd_sum_res)
    df['percentage_change'] = df['country'].map(percentage_change_res)
    df['test_country'] = df['country']
    df['type'] = selected_energy

    # 读取国家信息
    data_description = pd.read_csv('/data/xuanrenSong/CM_Power_Website/data/data_description.csv')

    data_description['starting_date'] = pd.to_datetime(data_description['starting_date']).dt.strftime('%Y-%b')

    df = pd.merge(df, data_description)

    # 筛选大洲
    if selected_continents:
        df = df[df['continent'].isin(selected_continents)].reset_index(drop=True)

    return df


def current_year_sum(group):
    latest_date_for_country = group['date'].max()
    current_year_data = group[group['date'].dt.year == latest_date_for_country.year]
    return current_year_data[current_year_data['date'] <= latest_date_for_country]['value'].sum()


def last_year_ytd_sum(group):
    latest_date_for_country = group['date'].max()
    lytd_end_date = latest_date_for_country.replace(year=latest_date_for_country.year - 1)
    last_year_data = group[group['date'].dt.year == lytd_end_date.year]
    return last_year_data[last_year_data['date'] <= lytd_end_date]['value'].sum()


selected_energy = 'total'
continents = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']
all_continents = ['World'] + continents

df = pd.read_csv('/data/xuanrenSong/CM_Power_Website/data/data_for_download.csv')
df = df[df['type'] == selected_energy].reset_index(drop=True)
print(df)
# 处理数据
df = transform_data(df, selected_energy, all_continents)
df = df.sort_values(by='year_to_date_sum', ascending=False).reset_index(drop=True)
print(df)
