import subprocess
import pandas as pd
import os
import ast
import math
import json

global_path = '/data/xuanrenSong/CM_Power_Website'
file_path = os.path.join(global_path, 'data')
tools_path = os.path.join(global_path, 'tools')

country_list = ['Australia', 'Brazil', 'Chile', 'China',
                'EU27&UK', 'France', 'Germany',
                'India', 'Italy', 'Japan', 'Mexico', 'New Zealand',
                'Russia', 'South Africa', 'Spain',
                'Turkey', 'United Kingdom', 'United States', 'Bolivia', 'Bangladesh']

categories = {
    'Fossil': ['coal', 'gas', 'oil'],
    'Nuclear': ['nuclear'],
    'Renewables': ['solar', 'wind', 'other', 'hydro']
}

COLORS = {
    "coal": "#A3A090",
    "oil": "#D4A58F",
    "gas": "#B6A1D4",
    "hydro": "#89C5C8",
    "nuclear": "#98D4A1",
    "other": "#E8ACBF",
    "solar": "#FDDCA3",
    "wind": "#AED3DE"
}


def main():
    # 先更新数据
    process_data()
    # Usage:
    git_push(global_path)


def process_data():
    df = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/global/Global_PM_corT.csv')

    df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
    df = pd.pivot_table(df, index=['country', 'date'], values='value', columns='sector').reset_index()
    df.columns = ['country', 'date', 'coal', 'gas', 'hydro', 'nuclear', 'oil', 'other', 'solar', 'wind']
    df['total'] = df.sum(axis=1, numeric_only=True)
    df['fossil'] = df[['coal', 'gas', 'oil']].sum(axis=1)
    df['renewables'] = df[['hydro', 'other', 'solar', 'wind']].sum(axis=1)

    df['country'] = df['country'].str.replace('EU27 & UK', 'EU27&UK')
    df['country'] = df['country'].replace('UK', 'United Kingdom')
    df['country'] = df['country'].str.replace('US', 'United States')
    df = df[df['country'].isin(country_list)].reset_index(drop=True)

    df['year'] = df['date'].dt.year
    df = df.set_index(['date', 'country', 'year']).stack().reset_index().rename(columns={'level_3': 'type', 0: 'value'})

    # 生成7日平滑数据
    df_7mean = df.copy()
    df_7mean['value'] = df_7mean.groupby(['country', 'type'])['value'].transform(
        lambda x: x.rolling(window=7, min_periods=1).mean())

    # 四舍五入到2位小数
    df_7mean['value'] = round(df_7mean['value'], 2)

    # 输出阶段
    # 先输出一版给首页data description 用的
    df.to_csv(os.path.join(file_path, 'data_for_download.csv'), index=False, encoding='utf_8_sig')

    # 再输出一版给line图用的
    df_7mean.to_csv(os.path.join(file_path, 'data_for_line_chart.csv'), index=False, encoding='utf_8_sig')

    # 再输出一版给stacked area用的
    process_stacked_area_data(df_7mean)

    # 再计算一版散点图用的
    df = load_power_data(df)
    df_iea = load_iea_data()
    df_filtered = prepare_comparison_data(df, df_iea)

    df_filtered.to_csv(os.path.join(file_path, 'data_for_scatter_plot.csv'), index=False, encoding='utf_8_sig')


def process_stacked_area_data(dataframe):
    dataframe = dataframe[~dataframe['type'].isin(['fossil', 'renewables', 'total'])].reset_index(drop=True)
    dataframe['total'] = dataframe.groupby(['country', 'date'])['value'].transform('sum')
    dataframe['percentage'] = round((dataframe['value'] / dataframe['total']) * 100, 2)

    df_7mean = dataframe[['date', 'country', 'year', 'type', 'percentage']]
    # df_7mean.to_csv(os.path.join(file_path, 'data_for_stacked_area_chart.csv'), index=False, encoding='utf_8_sig')

    # 根据最后一年选择的能源类型占比来分类 - 平均值
    df_sort = df_7mean.copy()
    last_year = max(df_sort['year'])
    df_sort['category'] = df_sort['type'].apply(map_to_category)
    # Group by the new 'category' column to get the sum of percentages for each category
    df_sort = df_sort.groupby(['date', 'country', 'year', 'category'])['percentage'].sum().reset_index()

    filtered_df = df_sort[(df_sort['year'] == last_year)].drop(columns=['year'])

    filtered_df = filtered_df.groupby(['country', 'category']).mean(numeric_only=True).reset_index()
    filtered_df['percentage'] = round(filtered_df['percentage'], 2)

    # filtered_df.to_csv(os.path.join(file_path, 'data_for_stacked_area_chart_for_sort.csv'),
    #                    index=False, encoding='utf_8_sig')

    # 再输出画图要用的json
    for selected_category, _ in categories.items():

        temp_df = filtered_df[filtered_df['category'] == selected_category]
        # Sort the countries by the average percentage in descending order
        sorted_countries = temp_df.sort_values(by='percentage', ascending=False)['country'].tolist()

        # Store the summed percentages in a dictionary for easier retrieval
        percentage_dict = dict(temp_df[['country', 'percentage']].values)

        energy_types = ['coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'other']

        COLS = 4
        ROWS = int(math.ceil(len(sorted_countries) / COLS))
        WIDTH = 100 / COLS
        HEIGHT = 92 / ROWS

        ROWS_PER_GRID = math.ceil(len(sorted_countries) / COLS)
        PLOT_HEIGHT = 200  # 根据需要进行调整

        WIDTH_ADJUSTMENT = 0.8
        HEIGHT_ADJUSTMENT = 1.0

        option = {
            "title": [{
                "text": "Power Generation Distribution by Source for Key Countries (%)",
                "left": "center",
                "top": "0%"
            }],
            "tooltip": {
                "trigger": "axis"
            },
            "legend": {
                "data": energy_types,
                "orient": "horizontal",
                "left": 'center',
                "top": 50,
                "icon": "circle",  # This will give a filled circle symbol
                "itemWidth": 12,  # Controls the width of the circle
                "itemHeight": 12,  # Controls the height of the circle
                "borderColor": "#333",  # Border color, here it's a dark gray
                "borderWidth": 1,  # Width of the border
                "borderRadius": 4,  # Rounded corners, adjust for desired roundness
                "padding": 10,  # Padding around the legend items
                "backgroundColor": "#f4f4f4",  # Light gray background for the legend
                "textStyle": {
                    "fontSize": 16,
                    "color": "#333"  # Font color matching the border color
                }
            },
            "xAxis": [],
            "yAxis": [],
            "grid": [],
            "series": [],
            "graphic": [],
        }

        # Grid, xAxis, and yAxis configurations remain the same
        for idx, country in enumerate(sorted_countries):
            country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
            country_dates = country_data['date'].dt.strftime('%Y-%m-%d').drop_duplicates().tolist()

            ratio_sum = percentage_dict.get(country, 0)
            ratio_sum_str = f"{ratio_sum:.2f}%"

            option["graphic"].append({
                "type": "text",
                "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT + WIDTH / 2 - 6}%",  # Centered horizontally
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 8}%",  # At the top of the grid
                "z": 100,  # Place it above other elements
                "style": {
                    "text": f"{country} - {selected_category} {ratio_sum_str}",
                    "fontSize": 14,
                    "fontWeight": "bold",
                    "textAlign": "center"  # Center align text
                }
            })

            option["grid"].append({
                "top": f"{HEIGHT * (idx // COLS) + HEIGHT_ADJUSTMENT + 10}%",
                "left": f"{WIDTH * (idx % COLS) + WIDTH_ADJUSTMENT}%",
                "width": f"{WIDTH - 2 * WIDTH_ADJUSTMENT}%",
                "height": f"{HEIGHT - 4 * HEIGHT_ADJUSTMENT}%",
                "containLabel": True
            })

            option["xAxis"].append({
                "gridIndex": idx,
                "type": "category",
                "data": country_dates
            })

            option["yAxis"].append({
                "gridIndex": idx,
                "type": "value",
                "min": 0,
                "max": 100,
                # "name": f"{country} - {selected_category} {ratio_sum_str}",
                "nameTextStyle": {
                    "fontSize": 14,
                    "fontWeight": "bold",
                    "padding": [0, 0, 0, 100]
                }
            })

        # New nested structure for series creation
        for energy_type in energy_types:
            for idx, country in enumerate(sorted_countries):
                country_data = df_7mean[df_7mean['country'] == country].reset_index(drop=True)
                series_data = country_data[country_data['type'] == energy_type]['percentage'].tolist()

                if len(series_data) == len(option["xAxis"][idx]["data"]):  # Ensure data alignment
                    option["series"].append({
                        "name": energy_type,
                        "type": "line",
                        "stack": country,  # Unique stack label based on country name
                        "areaStyle": {"color": COLORS.get(energy_type)},
                        "itemStyle": {"color": COLORS.get(energy_type)},
                        "xAxisIndex": idx,
                        "yAxisIndex": idx,
                        "data": series_data
                    })

        # 输出json
        # Save the configuration as a JSON file with the subcategory name
        with open(os.path.join(tools_path, f'{selected_category}.json'), 'w') as config_file:
            json.dump({
                "option": option,
                "ROWS_PER_GRID": ROWS_PER_GRID,
                "PLOT_HEIGHT": PLOT_HEIGHT
            }, config_file)


def load_power_data(df):
    df['date'] = pd.to_datetime(df['date'])
    df['month'] = df['date'].dt.month
    return df.drop(columns=['date']).groupby(['year', 'month', 'country', 'type']).sum().reset_index()


def load_iea_data():
    df_iea = pd.read_csv('/data/xuanrenSong/CM_Power_Database/data/other_database/iea/iea_cleaned.csv')
    country_replacements = {
        'Republic of Turkiye': 'Turkey',
        'Slovak Republic': 'Slovakia',
        "People's Republic of China": 'China'
    }
    df_iea['country'] = df_iea['country'].replace(country_replacements)

    with open(os.path.join(tools_path, 'eu_countries.txt'), 'r') as file:
        eu_countries = ast.literal_eval(file.read())

    df_iea_eu = df_iea[df_iea['country'].isin(eu_countries)].reset_index(drop=True)
    df_iea_eu['country'] = 'EU27&UK'
    df_iea_eu = df_iea_eu.groupby(['country', 'year', 'month']).sum().reset_index()

    df_iea = pd.concat([df_iea, df_iea_eu]).reset_index(drop=True)

    df_iea['total'] = df_iea[['coal', 'gas', 'oil', 'nuclear', 'hydro', 'solar', 'wind', 'other']].sum(axis=1)
    df_iea['fossil'] = df_iea[['coal', 'gas', 'oil']].sum(axis=1)
    df_iea['renewables'] = df_iea[['nuclear', 'hydro', 'solar', 'wind', 'other']].sum(axis=1)

    return df_iea.melt(id_vars=['country', 'year', 'month'], var_name='type', value_name='iea')


def prepare_comparison_data(df, df_iea):
    df_compare = pd.merge(df, df_iea)
    df_compare['value'] = round(df_compare['value'] / 1000, 2)
    df_compare['iea'] = round(df_compare['iea'] / 1000, 2)
    return df_compare


def git_push(repo_path, commit_message="Automated commit"):
    try:
        os.chdir(repo_path)

        # Pull the latest changes from the remote repository
        subprocess.run(['git', 'pull'])

        subprocess.run(['git', 'add', '--all'])
        subprocess.run(['git', 'commit', '-m', commit_message])

        # Get the current branch name
        current_branch = subprocess.getoutput('git rev-parse --abbrev-ref HEAD')
        subprocess.run(['git', 'push', 'origin', current_branch])

        print("Changes pulled and pushed successfully.")
    except Exception as e:
        print(f"Error: {e}")


def map_to_category(type_):
    for category, types in categories.items():
        if type_ in types:
            return category
    return None


if __name__ == "__main__":
    main()
